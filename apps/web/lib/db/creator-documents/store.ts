import { and, desc, sql as drizzleSql, eq, lt, or } from 'drizzle-orm';
import { isCanonicalUuid } from '@/lib/auth/profile-access';
import {
  hashRevision,
  ideaContent,
  nextRevision,
} from '@/lib/creator-documents/domain';
import type {
  CreatorDocumentListItem,
  CreatorDocumentPage,
} from '@/lib/creator-documents/types';
import { db } from '@/lib/db';
import {
  type CreatorDocumentContent,
  creatorDocumentRevisions,
  creatorDocuments,
} from '@/lib/db/schema/creator-documents';

export class CreatorDocumentConflictError extends Error {
  constructor(
    readonly code:
      | 'revision_conflict'
      | 'evidence_incomplete'
      | 'approval_ineligible'
      | 'claim_ineligible'
      | 'claim_ledger_frozen'
      | 'claim_source_inaccessible'
  ) {
    super(
      code === 'revision_conflict'
        ? 'Document changed in another session'
        : code === 'evidence_incomplete'
          ? 'Every factual script claim needs supporting evidence'
          : code === 'approval_ineligible'
            ? 'Only the current evidence-backed script can be approved'
            : code === 'claim_ledger_frozen'
              ? 'Claim ledger is frozen for review'
              : code === 'claim_source_inaccessible'
                ? 'Evidence source is inaccessible'
                : 'Claim does not belong to the current document revision'
    );
    this.name = 'CreatorDocumentConflictError';
  }
}

const CREATOR_DOCUMENT_PAGE_SIZE = 50;

function encodeDocumentCursor(input: {
  readonly createdAtCursor: string;
  readonly id: string;
}) {
  return Buffer.from(
    JSON.stringify({ createdAt: input.createdAtCursor, id: input.id })
  ).toString('base64url');
}

function decodeDocumentCursor(cursor: string | null | undefined) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = String(parsed.createdAt);
    if (
      Number.isNaN(new Date(createdAt).getTime()) ||
      typeof parsed.id !== 'string' ||
      !isCanonicalUuid(parsed.id)
    ) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listCreatorDocuments(
  creatorProfileId: string,
  options: { readonly cursor?: string | null } = {}
): Promise<CreatorDocumentPage> {
  const cursor = decodeDocumentCursor(options.cursor);
  if (options.cursor && !cursor) {
    throw new Error('Invalid creator document cursor');
  }
  const rows = await db
    .select({
      id: creatorDocuments.id,
      title: creatorDocuments.title,
      kind: creatorDocuments.kind,
      stage: creatorDocuments.stage,
      currentRevision: creatorDocuments.currentRevision,
      content: creatorDocumentRevisions.content,
      plainText: creatorDocumentRevisions.plainText,
      updatedAt: creatorDocuments.updatedAt,
      createdAtCursor: drizzleSql<string>`${creatorDocuments.createdAt}::text`,
    })
    .from(creatorDocuments)
    .innerJoin(
      creatorDocumentRevisions,
      and(
        eq(creatorDocumentRevisions.documentId, creatorDocuments.id),
        eq(creatorDocumentRevisions.revision, creatorDocuments.currentRevision)
      )
    )
    .where(
      and(
        eq(creatorDocuments.creatorProfileId, creatorProfileId),
        cursor
          ? or(
              drizzleSql`${creatorDocuments.createdAt} < ${cursor.createdAt}::timestamptz`,
              and(
                drizzleSql`${creatorDocuments.createdAt} = ${cursor.createdAt}::timestamptz`,
                lt(creatorDocuments.id, cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(creatorDocuments.createdAt), desc(creatorDocuments.id))
    .limit(CREATOR_DOCUMENT_PAGE_SIZE + 1);

  const pageRows = rows.slice(0, CREATOR_DOCUMENT_PAGE_SIZE);
  const documents: CreatorDocumentListItem[] = pageRows.map(
    ({ createdAtCursor: _createdAtCursor, ...row }) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })
  );
  const last = pageRows.at(-1);
  return {
    documents,
    nextCursor:
      rows.length > CREATOR_DOCUMENT_PAGE_SIZE && last
        ? encodeDocumentCursor(last)
        : null,
  };
}

export async function captureCreatorIdea(input: {
  readonly creatorProfileId: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly documentId: string; readonly deduplicated: boolean }> {
  const content = ideaContent(input.body);
  const contentHash = hashRevision({
    title: input.title,
    kind: 'idea',
    content,
  });
  const captured = await db.execute<{
    documentId: string;
    created: boolean;
  }>(drizzleSql`
    with inserted_document as (
      insert into ${creatorDocuments} (
        "creator_profile_id", "title", "kind", "capture_idempotency_key"
      )
      values (
        ${input.creatorProfileId}, ${input.title}, 'idea', ${input.idempotencyKey}
      )
      on conflict ("creator_profile_id", "capture_idempotency_key")
        where "capture_idempotency_key" is not null
      do update set
        "capture_idempotency_key" = excluded."capture_idempotency_key"
      returning "id", (xmax = 0) as created
    ), target_document as (
      select "id", created from inserted_document
    ), inserted_revision as (
      insert into ${creatorDocumentRevisions} (
        "document_id", "revision", "title", "kind", "content", "plain_text",
        "schema_version", "content_hash", "created_by_user_id"
      )
      select
        target_document."id", 1, ${input.title}, 'idea',
        ${JSON.stringify(content)}::jsonb, ${input.body}, 1, ${contentHash},
        ${input.userId}
      from target_document
      on conflict ("document_id", "revision") do nothing
      returning "document_id"
    )
    select
      target_document."id" as "documentId",
      target_document.created
    from target_document
    left join inserted_revision
      on inserted_revision."document_id" = target_document."id"
  `);
  const result = captured.rows[0];
  if (!result?.documentId) {
    throw new Error('Idea capture did not persist');
  }
  return { documentId: result.documentId, deduplicated: !result.created };
}

export async function saveCreatorDocumentRevision(input: {
  readonly creatorProfileId: string;
  readonly userId: string;
  readonly documentId: string;
  readonly expectedRevision: number;
  readonly title: string;
  readonly kind: 'idea' | 'research' | 'script';
  readonly content: CreatorDocumentContent;
  readonly plainText: string;
}): Promise<number> {
  const revision = nextRevision(input.expectedRevision);
  const contentHash = hashRevision({
    title: input.title,
    kind: input.kind,
    content: input.content,
  });
  const saved = await db.execute<{ revision: number }>(drizzleSql`
    with advanced as (
      update ${creatorDocuments}
      set
        "title" = ${input.title},
        "kind" = ${input.kind},
        "stage" = 'private_draft',
        "current_revision" = ${revision},
        "updated_at" = now()
      where ${creatorDocuments.id} = ${input.documentId}
        and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
        and ${creatorDocuments.currentRevision} = ${input.expectedRevision}
      returning "id"
    )
    insert into ${creatorDocumentRevisions} (
      "document_id",
      "revision",
      "title",
      "kind",
      "content",
      "plain_text",
      "schema_version",
      "content_hash",
      "created_by_user_id"
    )
    select
      advanced.id,
      ${revision},
      ${input.title},
      ${input.kind},
      ${JSON.stringify(input.content)}::jsonb,
      ${input.plainText},
      1,
      ${contentHash},
      ${input.userId}
    from advanced
    returning "revision"
  `);
  if (saved.rows[0]?.revision !== revision) {
    throw new CreatorDocumentConflictError('revision_conflict');
  }
  return revision;
}

export async function approveCreatorRevisionForCapture(input: {
  readonly creatorProfileId: string;
  readonly userId: string;
  readonly documentId: string;
  readonly revision: number;
}): Promise<void> {
  const result = await db.execute<{ id: string }>(drizzleSql`
    with locked_document as (
      select
        ${creatorDocuments.id} as document_id,
        ${creatorDocuments.currentRevision} as current_revision,
        ${creatorDocuments.stage} as stage
      from ${creatorDocuments}
      where ${creatorDocuments.id} = ${input.documentId}
        and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
      for update
    ), eligible as (
      select
        locked_document.document_id,
        ${creatorDocumentRevisions.id} as revision_id
      from locked_document
      join ${creatorDocumentRevisions}
        on ${creatorDocumentRevisions.documentId} = locked_document.document_id
        and ${creatorDocumentRevisions.revision} = locked_document.current_revision
      where locked_document.current_revision = ${input.revision}
        and locked_document.stage = 'evidence_review'
        and ${creatorDocumentRevisions.kind} = 'script'
        and not exists (
          select 1
          from creator_revision_claims claim
          where claim.revision_id = ${creatorDocumentRevisions.id}
            and claim.kind = 'fact'
            and (claim.evidence_state <> 'supported' or claim.source_record_id is null)
        )
    ), approved as (
      insert into creator_revision_approvals (
        document_id,
        revision_id,
        approved_by_user_id,
        revoked_at
      )
      select document_id, revision_id, ${input.userId}, null
      from eligible
      on conflict (document_id, revision_id)
      do update set revoked_at = null, approved_by_user_id = excluded.approved_by_user_id
      returning id, document_id, revision_id
    ), handed_off as (
      insert into creator_capture_handoffs (
        creator_profile_id,
        document_id,
        revision_id,
        approval_id
      )
      select ${input.creatorProfileId}, document_id, revision_id, id
      from approved
      on conflict (approval_id) do nothing
    )
    update ${creatorDocuments}
    set "stage" = 'capture_ready', "updated_at" = now()
    from eligible
    where ${creatorDocuments.id} = eligible.document_id
    returning ${creatorDocuments.id} as id
  `);
  if (!result.rows[0]?.id) {
    throw new CreatorDocumentConflictError('approval_ineligible');
  }
}

export async function completeCreatorEvidenceReview(input: {
  readonly creatorProfileId: string;
  readonly documentId: string;
  readonly revision: number;
}): Promise<void> {
  const result = await db.execute<{ outcome: string }>(drizzleSql`
    select complete_creator_evidence_review(
      ${input.creatorProfileId}::uuid,
      ${input.documentId}::uuid,
      ${input.revision}::integer
    ) as outcome
  `);
  const outcome = result.rows[0]?.outcome;
  if (outcome === 'updated') return;
  if (outcome === 'evidence_incomplete') {
    throw new CreatorDocumentConflictError('evidence_incomplete');
  }
  throw new CreatorDocumentConflictError('revision_conflict');
}

export async function addCreatorRevisionClaim(input: {
  readonly creatorProfileId: string;
  readonly userId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly claimText: string;
  readonly kind: 'fact' | 'inference' | 'opinion' | 'anecdote';
  readonly evidenceState: 'supported' | 'contested' | 'unresolved';
  readonly sourceRecordId: string | null;
}): Promise<string> {
  const result = await db.execute<{
    id: string | null;
    currentRevision: number | null;
    stage: string | null;
    revisionExists: boolean;
    sourceAccessible: boolean;
  }>(drizzleSql`
    with locked_context as (
      select
        ${creatorDocuments.currentRevision} as current_revision,
        ${creatorDocuments.stage} as stage,
        ${creatorDocumentRevisions.id} as revision_id
      from ${creatorDocuments}
      left join ${creatorDocumentRevisions}
        on ${creatorDocumentRevisions.documentId} = ${creatorDocuments.id}
        and ${creatorDocumentRevisions.revision} = ${input.revision}
      where ${creatorDocuments.id} = ${input.documentId}
        and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
      for update of ${creatorDocuments}
    ), source_access as (
      select (
        ${input.sourceRecordId}::uuid is null
        or exists (
          select 1 from memory_source_records source
          where source.id = ${input.sourceRecordId}::uuid
            and source.creator_profile_id = ${input.creatorProfileId}
            and source.user_id::text = ${input.userId}
        )
      ) as accessible
    ), inserted as (
      insert into creator_revision_claims (
      revision_id,
      claim_text,
      kind,
      evidence_state,
      source_record_id
    )
      select
      locked_context.revision_id,
      ${input.claimText},
      ${input.kind},
      ${input.evidenceState},
      ${input.sourceRecordId}
      from locked_context, source_access
      where locked_context.current_revision = ${input.revision}
        and locked_context.stage = 'private_draft'
        and locked_context.revision_id is not null
        and source_access.accessible
      returning id
    )
    select
      (select id from inserted) as id,
      (select current_revision from locked_context) as "currentRevision",
      (select stage from locked_context) as stage,
      coalesce((select revision_id is not null from locked_context), false) as "revisionExists",
      (select accessible from source_access) as "sourceAccessible"
  `);
  const outcome = result.rows[0];
  if (outcome?.id) return outcome.id;
  if (outcome?.currentRevision == null) {
    throw new CreatorDocumentConflictError('claim_ineligible');
  }
  if (outcome.currentRevision !== input.revision || !outcome.revisionExists) {
    throw new CreatorDocumentConflictError('revision_conflict');
  }
  if (outcome.stage !== 'private_draft') {
    throw new CreatorDocumentConflictError('claim_ledger_frozen');
  }
  if (!outcome.sourceAccessible) {
    throw new CreatorDocumentConflictError('claim_source_inaccessible');
  }
  throw new CreatorDocumentConflictError('claim_ineligible');
}
