import { and, desc, sql as drizzleSql, eq } from 'drizzle-orm';
import {
  hashRevision,
  ideaContent,
  nextRevision,
} from '@/lib/creator-documents/domain';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
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
  ) {
    super(
      code === 'revision_conflict'
        ? 'Document changed in another session'
        : code === 'evidence_incomplete'
          ? 'Every factual script claim needs supporting evidence'
          : 'Only the current evidence-backed script can be approved'
    );
    this.name = 'CreatorDocumentConflictError';
  }
}

export async function listCreatorDocuments(
  creatorProfileId: string
): Promise<CreatorDocumentListItem[]> {
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
    })
    .from(creatorDocuments)
    .innerJoin(
      creatorDocumentRevisions,
      and(
        eq(creatorDocumentRevisions.documentId, creatorDocuments.id),
        eq(creatorDocumentRevisions.revision, creatorDocuments.currentRevision)
      )
    )
    .where(eq(creatorDocuments.creatorProfileId, creatorProfileId))
    .orderBy(desc(creatorDocuments.updatedAt))
    .limit(100);

  return rows.map(row => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function captureCreatorIdea(input: {
  readonly creatorProfileId: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly documentId: string; readonly deduplicated: boolean }> {
  const existing = await db.query.creatorDocuments.findFirst({
    where: and(
      eq(creatorDocuments.creatorProfileId, input.creatorProfileId),
      eq(creatorDocuments.captureIdempotencyKey, input.idempotencyKey)
    ),
    columns: { id: true },
  });
  const inserted = existing
    ? []
    : await db
        .insert(creatorDocuments)
        .values({
          creatorProfileId: input.creatorProfileId,
          title: input.title,
          captureIdempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: creatorDocuments.id });

  const documentId =
    existing?.id ??
    inserted[0]?.id ??
    (
      await db.query.creatorDocuments.findFirst({
        where: and(
          eq(creatorDocuments.creatorProfileId, input.creatorProfileId),
          eq(creatorDocuments.captureIdempotencyKey, input.idempotencyKey)
        ),
        columns: { id: true },
      })
    )?.id;
  if (!documentId) {
    throw new Error('Idea capture did not persist');
  }

  const content = ideaContent(input.body);
  await db
    .insert(creatorDocumentRevisions)
    .values({
      documentId,
      revision: 1,
      title: input.title,
      kind: 'idea',
      content,
      plainText: input.body,
      contentHash: hashRevision({ title: input.title, kind: 'idea', content }),
      createdByUserId: input.userId,
    })
    .onConflictDoNothing({
      target: [
        creatorDocumentRevisions.documentId,
        creatorDocumentRevisions.revision,
      ],
    });

  return { documentId, deduplicated: inserted.length === 0 };
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
  const contentHash = hashRevision(input);
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
    with eligible as (
      select
        ${creatorDocuments.id} as document_id,
        ${creatorDocumentRevisions.id} as revision_id
      from ${creatorDocuments}
      join ${creatorDocumentRevisions}
        on ${creatorDocumentRevisions.documentId} = ${creatorDocuments.id}
        and ${creatorDocumentRevisions.revision} = ${creatorDocuments.currentRevision}
      where ${creatorDocuments.id} = ${input.documentId}
        and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
        and ${creatorDocuments.currentRevision} = ${input.revision}
        and ${creatorDocuments.stage} = 'evidence_review'
        and ${creatorDocumentRevisions.kind} = 'script'
        and exists (
          select 1
          from creator_revision_claims claim
          where claim.revision_id = ${creatorDocumentRevisions.id}
            and claim.kind = 'fact'
        )
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
  const result = await db.execute<{ id: string }>(drizzleSql`
    update ${creatorDocuments}
    set "stage" = 'evidence_review', "updated_at" = now()
    where ${creatorDocuments.id} = ${input.documentId}
      and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
      and ${creatorDocuments.currentRevision} = ${input.revision}
      and ${creatorDocuments.stage} = 'private_draft'
      and ${creatorDocuments.kind} = 'script'
      and exists (
        select 1
        from ${creatorDocumentRevisions} revision
        join creator_revision_claims claim on claim.revision_id = revision.id
        where revision.document_id = ${creatorDocuments.id}
          and revision.revision = ${input.revision}
          and claim.kind = 'fact'
      )
      and not exists (
        select 1
        from ${creatorDocumentRevisions} revision
        join creator_revision_claims claim on claim.revision_id = revision.id
        where revision.document_id = ${creatorDocuments.id}
          and revision.revision = ${input.revision}
          and claim.kind = 'fact'
          and (claim.evidence_state <> 'supported' or claim.source_record_id is null)
      )
    returning ${creatorDocuments.id} as id
  `);
  if (!result.rows[0]?.id) {
    throw new CreatorDocumentConflictError('evidence_incomplete');
  }
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
  const result = await db.execute<{ id: string }>(drizzleSql`
    insert into creator_revision_claims (
      revision_id,
      claim_text,
      kind,
      evidence_state,
      source_record_id
    )
    select
      ${creatorDocumentRevisions.id},
      ${input.claimText},
      ${input.kind},
      ${input.evidenceState},
      ${input.sourceRecordId}
    from ${creatorDocumentRevisions}
    join ${creatorDocuments}
      on ${creatorDocuments.id} = ${creatorDocumentRevisions.documentId}
    where ${creatorDocuments.id} = ${input.documentId}
      and ${creatorDocuments.creatorProfileId} = ${input.creatorProfileId}
      and ${creatorDocuments.currentRevision} = ${input.revision}
      and ${creatorDocuments.stage} = 'private_draft'
      and ${creatorDocumentRevisions.revision} = ${input.revision}
      and (
        ${input.sourceRecordId}::uuid is null
        or exists (
          select 1 from memory_source_records source
          where source.id = ${input.sourceRecordId}::uuid
            and source.creator_profile_id = ${input.creatorProfileId}
            and source.user_id::text = ${input.userId}
        )
      )
    returning id
  `);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(
      'Claim ledger is frozen or evidence is not private to this profile'
    );
  }
  return id;
}
