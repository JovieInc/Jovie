import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, max } from 'drizzle-orm';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { db, doesTableExist } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  contentRecordEvents,
  contentRecordLive,
  contentRecordVersions,
} from '@/lib/db/schema/content-records';
import { captureWarning } from '@/lib/error-tracking';
import { getDeployedBuildInfo } from '@/lib/observability/build-info';
import { authorizeFounderSummerUser } from '@/lib/ovie/summer-founder-auth';
import { resolveContentApprover } from './access.server';
import {
  type ContentKindDefinition,
  contentRecordCacheTag,
  gateContentRecord,
  validateContentRecord,
} from './kind';
import {
  type ContentReviewIdentity,
  contentApprovalProof,
  contentReviewIdentity,
} from './publication';

/**
 * The versioned content record store (`.claude/rules/data-vs-code.md`).
 *
 * Reads: `getLiveContent` serves the published version through Next's data
 * cache, tagged per record, so steady-state page renders issue zero database
 * reads. Missing tables, an empty pointer, a store error, or a stored value
 * that no longer validates all fall back to the kind's repo-seeded default.
 *
 * Writes: drafts are immutable versions; publish and rollback move one live
 * pointer and append one audit event in the same atomic operation, then
 * expire the record's cache tag so the next request renders the new version.
 */

const TABLE = 'content_record_live';

export type ContentSource = 'live' | 'default';

export interface LiveContent<T> {
  readonly data: T;
  readonly source: ContentSource;
  readonly versionId: string | null;
  readonly version: number | null;
  readonly publishedAt: string | null;
  readonly fallbackReason?: 'unavailable' | 'unpublished' | 'incompatible';
}

interface StoredLive {
  readonly versionId: string;
  readonly version: number;
  readonly data: unknown;
  readonly publishedAt: string;
  readonly schemaVersion: number;
}

async function readStoredLive(
  kind: string,
  key: string
): Promise<StoredLive | null> {
  if (!(await doesTableExist(TABLE))) return null;
  const [row] = await db
    .select({
      versionId: contentRecordLive.versionId,
      publishedAt: contentRecordLive.publishedAt,
      version: contentRecordVersions.version,
      data: contentRecordVersions.data,
      schemaVersion: contentRecordVersions.schemaVersion,
    })
    .from(contentRecordLive)
    .innerJoin(
      contentRecordVersions,
      eq(contentRecordVersions.id, contentRecordLive.versionId)
    )
    .where(
      and(
        eq(contentRecordLive.kind, kind),
        eq(contentRecordLive.recordKey, key)
      )
    )
    .limit(1);
  return row
    ? {
        versionId: row.versionId,
        version: row.version,
        data: row.data,
        schemaVersion: row.schemaVersion,
        publishedAt: row.publishedAt.toISOString(),
      }
    : null;
}

function defaultContent<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  fallbackReason: NonNullable<LiveContent<T>['fallbackReason']> = 'unpublished'
): LiveContent<T> {
  return {
    data: definition.defaultRecord(key),
    source: 'default',
    versionId: null,
    version: null,
    publishedAt: null,
    fallbackReason,
  };
}

/** Published record for `key`, or the repo default. Never throws. */
export async function getLiveContent<T>(
  definition: ContentKindDefinition<T>,
  key: string
): Promise<LiveContent<T>> {
  let stored: StoredLive | null;
  try {
    stored = await unstable_cache(
      () => readStoredLive(definition.kind, key),
      ['content-record-live', definition.kind, key],
      { tags: [contentRecordCacheTag(definition.kind, key)] }
    )();
  } catch (error) {
    await captureWarning('Content record read failed', error, {
      kind: definition.kind,
      key,
    });
    return defaultContent(definition, key, 'unavailable');
  }
  if (!stored) return defaultContent(definition, key);

  const validated = validateContentRecord(definition, key, stored.data);
  if (!validated.ok || stored.schemaVersion !== definition.schemaVersion) {
    await captureWarning(
      'Live content record no longer validates',
      new Error(
        validated.ok
          ? 'Stored content schema revision changed'
          : validated.errors.join('; ')
      ),
      { kind: definition.kind, key, versionId: stored.versionId }
    );
    return defaultContent(definition, key, 'incompatible');
  }
  return {
    data: validated.data,
    source: 'live',
    versionId: stored.versionId,
    version: stored.version,
    publishedAt: stored.publishedAt,
  };
}

export interface ContentVersionSummary {
  readonly id: string;
  readonly kind: string;
  readonly key: string;
  readonly version: number;
  readonly schemaVersion: number;
  readonly author: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ContentVersion extends ContentVersionSummary {
  readonly data: unknown;
}

function toVersion(
  row: typeof contentRecordVersions.$inferSelect
): ContentVersion {
  return {
    id: row.id,
    kind: row.kind,
    key: row.recordKey,
    version: row.version,
    schemaVersion: row.schemaVersion,
    author: row.author,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    data: row.data,
  };
}

/** One stored version by id (uncached: preview and publish read this). */
export async function getContentVersion(
  versionId: string
): Promise<ContentVersion | null> {
  const [row] = await db
    .select()
    .from(contentRecordVersions)
    .where(eq(contentRecordVersions.id, versionId))
    .limit(1);
  return row ? toVersion(row) : null;
}

export class ContentValidationError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Content record failed validation: ${errors.join('; ')}`);
    this.name = 'ContentValidationError';
  }
}

export class ContentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentConflictError';
  }
}

/** Validates and stores a new immutable version. Does not publish it. */
export async function createContentVersion<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly data: unknown;
    readonly author: string;
    readonly note?: string | null;
  }
): Promise<ContentVersion> {
  const validated = gateContentRecord(definition, input.key, input.data);
  if (!validated.ok) throw new ContentValidationError(validated.errors);

  const row = await runAtomicDbOperation(
    async tx => {
      const [current] = await tx
        .select({ latest: max(contentRecordVersions.version) })
        .from(contentRecordVersions)
        .where(
          and(
            eq(contentRecordVersions.kind, definition.kind),
            eq(contentRecordVersions.recordKey, input.key)
          )
        );
      const [inserted] = await tx
        .insert(contentRecordVersions)
        .values({
          kind: definition.kind,
          recordKey: input.key,
          version: (current?.latest ?? 0) + 1,
          schemaVersion: definition.schemaVersion,
          data: validated.data,
          author: input.author,
          note: input.note ?? null,
        })
        .returning();
      return inserted;
    },
    { actorId: input.author, system: true, retry: 'serialization' }
  );
  if (!row) throw new Error('Content version insert returned no row');
  return toVersion(row);
}

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

export class ContentAuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    message: string
  ) {
    super(message);
    this.name = 'ContentAuthorizationError';
  }
}

export class ContentPublicationUncertainError extends Error {
  constructor(readonly operationId: string) {
    super(
      'Publication outcome is uncertain; reconcile this operation before retrying'
    );
    this.name = 'ContentPublicationUncertainError';
  }
}

type Event = typeof contentRecordEvents.$inferSelect;
type MoveInput = {
  readonly key: string;
  readonly versionId: string;
  readonly actor: string;
  readonly reason?: string | null;
  readonly expectedLiveVersionId?: string | null;
  readonly approvalId?: string;
  readonly operationId?: string;
};

async function readLiveVersionId(
  kind: string,
  key: string
): Promise<string | null> {
  const [row] = await db
    .select({ versionId: contentRecordLive.versionId })
    .from(contentRecordLive)
    .where(
      and(
        eq(contentRecordLive.kind, kind),
        eq(contentRecordLive.recordKey, key)
      )
    )
    .limit(1);
  return row?.versionId ?? null;
}

async function readEvent(id: string): Promise<Event | null> {
  const [row] = await db
    .select()
    .from(contentRecordEvents)
    .where(eq(contentRecordEvents.id, id))
    .limit(1);
  return row ?? null;
}

async function targetVersion<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  id: string
) {
  const target = await getContentVersion(id);
  if (!target || target.kind !== definition.kind || target.key !== key) {
    throw new ContentConflictError(
      `Version ${id} is not a ${definition.kind}/${key} version`
    );
  }
  if (target.schemaVersion !== definition.schemaVersion) {
    throw new ContentConflictError(
      'Stored content schema revision changed; create a compatible version'
    );
  }
  return target;
}

const RENDER_SMOKE_TIMEOUT_MS = 5_000;

async function runPublicationSmoke<T>(
  definition: ContentKindDefinition<T>,
  data: T,
  key: string,
  identity: ContentReviewIdentity
) {
  if (!definition.renderSmoke) {
    throw new ContentConflictError(
      'No same-version renderer evidence hook is registered; publication remains closed'
    );
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const observed = await Promise.race([
      definition.renderSmoke({
        data,
        key,
        identity,
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Render smoke deadline exceeded'));
        }, RENDER_SMOKE_TIMEOUT_MS);
      }),
    ]);
    if (
      !observed ||
      observed.reviewDigest !== identity.reviewDigest ||
      observed.versionId !== identity.versionId ||
      observed.renderBuildId !== identity.renderBuildId ||
      !Array.isArray(observed.errors) ||
      observed.errors.length !== 0
    ) {
      throw new Error(
        'Missing, failed or mismatched same-version render evidence'
      );
    }
  } catch (error) {
    throw new ContentValidationError([
      error instanceof Error ? error.message : 'Render smoke failed',
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Used by draft responses and the preview; never accepts a caller's renderer identity. */
export async function getContentReviewIdentity<T>(
  definition: ContentKindDefinition<T>,
  key: string,
  versionId: string
): Promise<ContentReviewIdentity | null> {
  const target = await targetVersion(definition, key, versionId);
  return contentReviewIdentity(
    target,
    await getDeployedBuildInfo(),
    await readLiveVersionId(definition.kind, key)
  );
}

/** Append a founder-authenticated decision to the existing immutable audit log. */
export async function approveContentVersion<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly versionId: string;
    readonly decisionId: string;
    readonly reviewDigest: string;
    readonly expectedLiveVersionId: string | null;
  },
  request: Request
): Promise<{ readonly id: string; readonly identity: ContentReviewIdentity }> {
  const founder = await resolveContentApprover(request);
  if (!founder.ok)
    throw new ContentAuthorizationError(founder.status, founder.error);
  const target = await targetVersion(definition, input.key, input.versionId);
  const checked = gateContentRecord(definition, input.key, target.data);
  if (!checked.ok) throw new ContentValidationError(checked.errors);
  const identity = contentReviewIdentity(
    target,
    await getDeployedBuildInfo(),
    input.expectedLiveVersionId
  );
  if (!identity || identity.reviewDigest !== input.reviewDigest) {
    throw new ContentConflictError(
      'Preview payload or renderer changed; review the exact version again'
    );
  }
  // The existing experiment workflow has no complete-arm decision receipt.
  if (
    target.data &&
    typeof target.data === 'object' &&
    'experiment' in target.data
  ) {
    throw new ContentConflictError(
      'A complete experiment-arm approval receipt is required'
    );
  }
  if (
    (await readLiveVersionId(definition.kind, input.key)) !==
    input.expectedLiveVersionId
  ) {
    throw new ContentConflictError('Live version changed after preview');
  }
  await runPublicationSmoke(definition, checked.data, input.key, identity);
  const reason = contentApprovalProof(identity);
  const matches = (event: Event) =>
    event.action === 'approve' &&
    event.kind === definition.kind &&
    event.recordKey === input.key &&
    event.toVersionId === target.id &&
    event.fromVersionId === input.expectedLiveVersionId &&
    event.actor === founder.actor &&
    event.reason === reason;
  const previous = await readEvent(input.decisionId);
  if (previous) {
    if (!matches(previous))
      throw new ContentConflictError('Decision id belongs to another approval');
    return { id: previous.id, identity };
  }
  try {
    await db
      .insert(contentRecordEvents)
      .values({
        id: input.decisionId,
        kind: definition.kind,
        recordKey: input.key,
        action: 'approve',
        fromVersionId: input.expectedLiveVersionId,
        toVersionId: target.id,
        actor: founder.actor,
        reason,
      })
      .onConflictDoNothing();
  } catch {
    // A transport failure does not establish that the insert failed.
  }
  const stored = await readEvent(input.decisionId);
  if (!stored) throw new ContentPublicationUncertainError(input.decisionId);
  if (!matches(stored))
    throw new ContentConflictError('Decision id belongs to another approval');
  return { id: stored.id, identity };
}

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
