import 'server-only';
import { and, desc, eq, gte, max } from 'drizzle-orm';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { db, doesTableExist } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  contentRecordEvents,
  contentRecordLive,
  contentRecordVersions,
} from '@/lib/db/schema/content-records';
import { captureWarning } from '@/lib/error-tracking';
import {
  type ContentKindDefinition,
  contentRecordCacheTag,
  gateContentRecord,
  validateContentRecord,
} from './kind';

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
}

interface StoredLive {
  readonly versionId: string;
  readonly version: number;
  readonly data: unknown;
  readonly publishedAt: string;
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
        publishedAt: row.publishedAt.toISOString(),
      }
    : null;
}

function defaultContent<T>(
  definition: ContentKindDefinition<T>,
  key: string
): LiveContent<T> {
  return {
    data: definition.defaultRecord(key),
    source: 'default',
    versionId: null,
    version: null,
    publishedAt: null,
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
    return defaultContent(definition, key);
  }
  if (!stored) return defaultContent(definition, key);

  const validated = validateContentRecord(definition, key, stored.data);
  if (!validated.ok) {
    await captureWarning(
      'Live content record no longer validates',
      new Error(validated.errors.join('; ')),
      { kind: definition.kind, key, versionId: stored.versionId }
    );
    return defaultContent(definition, key);
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
  readonly fromVersionId: string | null;
  readonly toVersionId: string;
  readonly toVersion: number;
  readonly publishedAt: string;
}

function expireLiveCaches<T>(
  definition: ContentKindDefinition<T>,
  key: string
): void {
  revalidateTag(contentRecordCacheTag(definition.kind, key), { expire: 0 });
  for (const path of definition.livePaths(key)) revalidatePath(path);
}

async function movePointer<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly versionId: string;
    readonly actor: string;
    readonly reason?: string | null;
    readonly action: ContentPointerAction;
  }
): Promise<ContentPointerMove> {
  const target = await getContentVersion(input.versionId);
  if (!target || target.kind !== definition.kind || target.key !== input.key) {
    throw new ContentConflictError(
      `Version ${input.versionId} is not a ${definition.kind}/${input.key} version`
    );
  }
  // Re-validate at publish time: the registry or legal guards may have moved
  // since the draft was written.
  const validated = validateContentRecord(definition, input.key, target.data);
  if (!validated.ok) throw new ContentValidationError(validated.errors);

  const publishedAt = new Date();
  const fromVersionId = await runAtomicDbOperation(
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
      await tx
        .insert(contentRecordLive)
        .values({
          kind: definition.kind,
          recordKey: input.key,
          versionId: target.id,
          publishedAt,
          publishedBy: input.actor,
        })
        .onConflictDoUpdate({
          target: [contentRecordLive.kind, contentRecordLive.recordKey],
          set: { versionId: target.id, publishedAt, publishedBy: input.actor },
        });
      await tx.insert(contentRecordEvents).values({
        kind: definition.kind,
        recordKey: input.key,
        action: input.action,
        fromVersionId: current?.versionId ?? null,
        toVersionId: target.id,
        actor: input.actor,
        reason: input.reason ?? null,
        createdAt: publishedAt,
      });
      return current?.versionId ?? null;
    },
    { actorId: input.actor, system: true, retry: 'serialization' }
  );

  expireLiveCaches(definition, input.key);
  return {
    kind: definition.kind,
    key: input.key,
    action: input.action,
    fromVersionId,
    toVersionId: target.id,
    toVersion: target.version,
    publishedAt: publishedAt.toISOString(),
  };
}

/** Make `versionId` the live version for `key`. */
export function publishContentVersion<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly versionId: string;
    readonly actor: string;
    readonly reason?: string | null;
  }
): Promise<ContentPointerMove> {
  return movePointer(definition, { ...input, action: 'publish' });
}

/**
 * Roll back to `toVersionId`, or by default to the version that was live
 * before the most recent pointer move.
 */
export async function rollbackContent<T>(
  definition: ContentKindDefinition<T>,
  input: {
    readonly key: string;
    readonly actor: string;
    readonly reason?: string | null;
    readonly toVersionId?: string | null;
  }
): Promise<ContentPointerMove> {
  let target = input.toVersionId ?? null;
  if (!target) {
    const [last] = await db
      .select({ fromVersionId: contentRecordEvents.fromVersionId })
      .from(contentRecordEvents)
      .where(
        and(
          eq(contentRecordEvents.kind, definition.kind),
          eq(contentRecordEvents.recordKey, input.key)
        )
      )
      .orderBy(desc(contentRecordEvents.createdAt))
      .limit(1);
    target = last?.fromVersionId ?? null;
  }
  if (!target) {
    throw new ContentConflictError(
      `No earlier ${definition.kind}/${input.key} version to roll back to`
    );
  }
  return movePointer(definition, {
    key: input.key,
    versionId: target,
    actor: input.actor,
    reason: input.reason,
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
