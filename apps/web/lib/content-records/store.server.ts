import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  contentRecordEvents,
  contentRecordLive,
  contentRecordVersions,
} from '@/lib/db/schema/content-records';
import { captureWarning } from '@/lib/error-tracking';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { authorizeFounderSummerUser } from '@/lib/ovie/summer-founder-auth';
import {
  type ContentKindDefinition,
  contentRecordCacheTag,
  gateContentRecord,
} from './kind';
import { contentApprovalProof, contentReviewIdentity } from './publication';
import {
  ContentConflictError,
  ContentPublicationUncertainError,
  ContentValidationError,
} from './store-errors';
import {
  type ContentPublicationEvent as Event,
  readEvent,
  runPublicationSmoke,
  targetVersion,
} from './store-review.server';
import {
  type ContentSource,
  type ContentVersion,
  type ContentVersionSummary,
  getContentVersion,
  getLiveContent,
  toVersion,
} from './store-versions.server';

export {
  ContentAuthorizationError,
  ContentConflictError,
  ContentPublicationUncertainError,
  ContentValidationError,
} from './store-errors';
export {
  approveContentVersion,
  getContentReviewIdentity,
} from './store-review.server';
export type {
  ContentSource,
  ContentVersion,
  ContentVersionSummary,
  LiveContent,
} from './store-versions.server';
export {
  createContentVersion,
  getContentVersion,
  getLiveContent,
} from './store-versions.server';

/** Public content store: conditional pointer writes, audit, and history. */
export type ContentPointerAction = 'publish' | 'rollback';

export interface ContentPointerMove {
  readonly kind: string;
  readonly key: string;
  readonly action: ContentPointerAction;
  readonly operationId: string;
  readonly fromVersionId: string | null;
  readonly toVersionId: string;
  readonly toVersion: number;
  readonly publishedAt: string;
  readonly cacheInvalidation: 'complete' | 'uncertain';
  readonly readback: {
    readonly source: ContentSource;
    readonly versionId: string | null;
  };
  /** A store/cache read is not evidence that a public request delivered the page. */
  readonly delivery: 'unverified';
}

type MoveInput = {
  readonly key: string;
  readonly versionId: string;
  readonly actor: string;
  readonly reason?: string | null;
  readonly expectedLiveVersionId?: string | null;
  readonly approvalId?: string;
  readonly operationId?: string;
};

function expireLiveCaches<T>(
  definition: ContentKindDefinition<T>,
  key: string
): void {
  revalidateTag(contentRecordCacheTag(definition.kind, key), { expire: 0 });
  for (const path of definition.livePaths(key)) revalidatePath(path);
}

async function publicationReadback<T>(
  definition: ContentKindDefinition<T>,
  target: ContentVersion,
  event: Event
): Promise<ContentPointerMove> {
  let cacheInvalidation: ContentPointerMove['cacheInvalidation'] = 'complete';
  try {
    expireLiveCaches(definition, target.key);
  } catch (error) {
    cacheInvalidation = 'uncertain';
    await captureWarning(
      'Content pointer committed but cache invalidation failed',
      error,
      {
        operationId: event.id,
        versionId: target.id,
      }
    );
  }
  const live = await getLiveContent(definition, target.key);
  return {
    kind: definition.kind,
    key: target.key,
    action: event.action as ContentPointerAction,
    operationId: event.id,
    fromVersionId: event.fromVersionId,
    toVersionId: target.id,
    toVersion: target.version,
    publishedAt: event.createdAt.toISOString(),
    cacheInvalidation,
    readback: { source: live.source, versionId: live.versionId },
    delivery: 'unverified',
  };
}

async function movePointer<T>(
  definition: ContentKindDefinition<T>,
  input: MoveInput & { readonly action: ContentPointerAction }
): Promise<ContentPointerMove> {
  const editorial = definition.apiWritable !== false;
  if (
    editorial &&
    (input.expectedLiveVersionId === undefined ||
      !input.operationId ||
      !input.approvalId)
  ) {
    throw new ContentConflictError(
      'Expected live version, operation id and exact founder approval are required'
    );
  }
  const operationId = input.operationId ?? randomUUID();
  const reason = JSON.stringify({
    schema: 'content-record-publication/v1',
    approvalId: input.approvalId ?? null,
    reason: input.reason ?? null,
  });
  const matches = (event: Event) =>
    event.kind === definition.kind &&
    event.recordKey === input.key &&
    event.action === input.action &&
    event.toVersionId === input.versionId &&
    event.actor === input.actor &&
    event.reason === reason &&
    (input.expectedLiveVersionId === undefined ||
      event.fromVersionId === input.expectedLiveVersionId);
  const previous = await readEvent(operationId);
  if (previous) {
    if (!matches(previous))
      throw new ContentConflictError(
        'Operation id belongs to another publication'
      );
    const historicalTarget = await getContentVersion(previous.toVersionId);
    if (
      !historicalTarget ||
      historicalTarget.kind !== definition.kind ||
      historicalTarget.key !== input.key
    ) {
      throw new ContentPublicationUncertainError(operationId);
    }
    return publicationReadback(definition, historicalTarget, previous);
  }
  const target = await targetVersion(definition, input.key, input.versionId);
  const checked = gateContentRecord(definition, input.key, target.data);
  if (!checked.ok) throw new ContentValidationError(checked.errors);
  if (editorial) {
    const identity = contentReviewIdentity(
      target,
      await getDeployedBuildInfo(),
      input.expectedLiveVersionId ?? null
    );
    const approval = await readEvent(input.approvalId!);
    if (
      !identity ||
      !approval ||
      approval.action !== 'approve' ||
      approval.kind !== definition.kind ||
      approval.recordKey !== input.key ||
      approval.toVersionId !== target.id ||
      approval.fromVersionId !== input.expectedLiveVersionId ||
      approval.reason !== contentApprovalProof(identity) ||
      !approval.actor.startsWith('user:') ||
      authorizeFounderSummerUser(approval.actor.slice(5)) !== 'authorized'
    ) {
      throw new ContentConflictError(
        'Missing, stale or mismatched founder approval'
      );
    }
    await runPublicationSmoke(definition, checked.data, input.key, identity);
  }
  const publishedAt = new Date();
  let committed: Event;
  try {
    committed = await runAtomicDbOperation(
      async tx => {
        const [current] = await tx
          .select({ versionId: contentRecordLive.versionId })
          .from(contentRecordLive)
          .where(
            and(
              eq(contentRecordLive.kind, definition.kind),
              eq(contentRecordLive.recordKey, input.key)
            )
          )
          .limit(1);
        const expected =
          input.expectedLiveVersionId === undefined
            ? (current?.versionId ?? null)
            : input.expectedLiveVersionId;
        if ((current?.versionId ?? null) !== expected)
          throw new ContentConflictError(
            'Live version changed; publication was not applied'
          );
        const values = {
          kind: definition.kind,
          recordKey: input.key,
          versionId: target.id,
          publishedAt,
          publishedBy: input.actor,
        };
        const changed =
          expected === null
            ? await tx
                .insert(contentRecordLive)
                .values(values)
                .onConflictDoNothing()
                .returning({ versionId: contentRecordLive.versionId })
            : await tx
                .update(contentRecordLive)
                .set(values)
                .where(
                  and(
                    eq(contentRecordLive.kind, definition.kind),
                    eq(contentRecordLive.recordKey, input.key),
                    eq(contentRecordLive.versionId, expected)
                  )
                )
                .returning({ versionId: contentRecordLive.versionId });
        if (changed.length !== 1)
          throw new ContentConflictError(
            'A concurrent publisher won; publication was not applied'
          );
        const [event] = await tx
          .insert(contentRecordEvents)
          .values({
            id: operationId,
            kind: definition.kind,
            recordKey: input.key,
            action: input.action,
            fromVersionId: expected,
            toVersionId: target.id,
            actor: input.actor,
            reason,
            createdAt: publishedAt,
          })
          .returning();
        if (!event) throw new Error('Publication audit insert returned no row');
        return event;
      },
      { actorId: input.actor, system: true, retry: 'serialization' }
    );
  } catch (error) {
    let observed: Event | null;
    try {
      observed = await readEvent(operationId);
    } catch {
      throw new ContentPublicationUncertainError(operationId);
    }
    if (observed && matches(observed)) committed = observed;
    else if (observed)
      throw new ContentConflictError(
        'Operation id belongs to another publication'
      );
    else if (error instanceof ContentConflictError) throw error;
    else throw new ContentPublicationUncertainError(operationId);
  }
  return publicationReadback(definition, target, committed);
}

/** Editable kinds require a founder receipt. Producer-only kinds retain their existing producer boundary. */
export function publishContentVersion<T>(
  definition: ContentKindDefinition<T>,
  input: MoveInput
): Promise<ContentPointerMove> {
  return movePointer(definition, { ...input, action: 'publish' });
}

export async function rollbackContent<T>(
  definition: ContentKindDefinition<T>,
  input: Omit<MoveInput, 'versionId'> & { readonly toVersionId?: string | null }
): Promise<ContentPointerMove> {
  let target = input.toVersionId ?? null;
  if (!target && input.operationId) {
    const existing = await readEvent(input.operationId);
    if (existing) {
      if (
        existing.action !== 'rollback' ||
        existing.kind !== definition.kind ||
        existing.recordKey !== input.key
      ) {
        throw new ContentConflictError(
          'Operation id belongs to another publication'
        );
      }
      target = existing.toVersionId;
    }
  }
  if (!target) {
    const [last] = await db
      .select({ fromVersionId: contentRecordEvents.fromVersionId })
      .from(contentRecordEvents)
      .where(
        and(
          eq(contentRecordEvents.kind, definition.kind),
          eq(contentRecordEvents.recordKey, input.key),
          inArray(contentRecordEvents.action, ['publish', 'rollback'])
        )
      )
      .orderBy(desc(contentRecordEvents.createdAt))
      .limit(1);
    target = last?.fromVersionId ?? null;
  }
  if (!target)
    throw new ContentConflictError(
      `No earlier ${definition.kind}/${input.key} version to roll back to`
    );
  return movePointer(definition, {
    ...input,
    versionId: target,
    action: 'rollback',
  });
}

export interface ContentHistory {
  readonly live: {
    readonly versionId: string;
    readonly publishedAt: string;
  } | null;
  readonly versions: readonly ContentVersionSummary[];
  readonly events: readonly {
    readonly id: string;
    readonly action: string;
    readonly fromVersionId: string | null;
    readonly toVersionId: string;
    readonly actor: string;
    readonly reason: string | null;
    readonly createdAt: string;
  }[];
}

const HISTORY_LIMIT = 50;

/** Versions and audit events for one record, newest first. */
export async function getContentHistory(
  kind: string,
  key: string
): Promise<ContentHistory> {
  const [liveRows, versionRows, eventRows] = await Promise.all([
    db
      .select()
      .from(contentRecordLive)
      .where(
        and(
          eq(contentRecordLive.kind, kind),
          eq(contentRecordLive.recordKey, key)
        )
      )
      .limit(1),
    db
      .select()
      .from(contentRecordVersions)
      .where(
        and(
          eq(contentRecordVersions.kind, kind),
          eq(contentRecordVersions.recordKey, key)
        )
      )
      .orderBy(desc(contentRecordVersions.version))
      .limit(HISTORY_LIMIT),
    db
      .select()
      .from(contentRecordEvents)
      .where(
        and(
          eq(contentRecordEvents.kind, kind),
          eq(contentRecordEvents.recordKey, key)
        )
      )
      .orderBy(desc(contentRecordEvents.createdAt))
      .limit(HISTORY_LIMIT),
  ]);
  const live = liveRows[0];
  return {
    live: live
      ? {
          versionId: live.versionId,
          publishedAt: live.publishedAt.toISOString(),
        }
      : null,
    versions: versionRows.map(row => {
      const { data: _data, ...summary } = toVersion(row);
      return summary;
    }),
    events: eventRows.map(row => ({
      id: row.id,
      action: row.action,
      fromVersionId: row.fromVersionId,
      toVersionId: row.toVersionId,
      actor: row.actor,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Versions and pointer moves since `since`, for the stage feed. */
export async function getContentStageRows(since: Date) {
  const [versions, events] = await Promise.all([
    db
      .select()
      .from(contentRecordVersions)
      .where(gte(contentRecordVersions.createdAt, since))
      .orderBy(desc(contentRecordVersions.createdAt))
      .limit(2000),
    db
      .select()
      .from(contentRecordEvents)
      .where(gte(contentRecordEvents.createdAt, since))
      .orderBy(desc(contentRecordEvents.createdAt))
      .limit(2000),
  ]);
  return { versions, events };
}
