import 'server-only';
import { and, eq, max } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, doesTableExist } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
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
import { ContentValidationError } from './store-errors';

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

export function toVersion(
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
