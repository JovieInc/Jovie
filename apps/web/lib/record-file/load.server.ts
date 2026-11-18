import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { memorySourceRecords } from '@/lib/db/schema/memory';
import { defaultMemoryStore } from '@/lib/memory/drizzle-store';
import { queryMemoryGraph } from '@/lib/memory/graph-query';
import type { MemoryScope, MemoryStore } from '@/lib/memory/types';
import {
  buildRecordFile,
  type RecordFile,
  type RecordFileBuildInput,
  type RecordFileSourceInput,
} from './build';

export type ListRecordFileSources = (
  scope: MemoryScope,
  sourceRecordIds: readonly string[]
) => Promise<readonly RecordFileSourceInput[]>;

/** Read-only, scoped fetch of source record metadata. Bodies are never stored. */
export const listRecordFileSources: ListRecordFileSources = async (
  scope,
  sourceRecordIds
) => {
  if (sourceRecordIds.length === 0) return [];
  return db
    .select({
      id: memorySourceRecords.id,
      sourceType: memorySourceRecords.sourceType,
      externalId: memorySourceRecords.externalId,
      metadata: memorySourceRecords.metadata,
      createdAt: memorySourceRecords.createdAt,
    })
    .from(memorySourceRecords)
    .where(
      and(
        eq(memorySourceRecords.userId, scope.userId),
        eq(memorySourceRecords.creatorProfileId, scope.creatorProfileId),
        inArray(memorySourceRecords.id, [...sourceRecordIds])
      )
    );
};

export interface LoadRecordFileOptions {
  readonly asOf: Date;
  readonly featureConsent?: RecordFileBuildInput['featureConsent'];
  readonly store?: MemoryStore;
  readonly listSources?: ListRecordFileSources;
}

/**
 * Loads a record file for one memory release/recording entity. Sources are
 * the record's non-rejected observations; people are its adjacent edges.
 * Returns null when the entity is missing or is not a record.
 */
export async function loadRecordFile(
  scope: MemoryScope,
  recordEntityId: string,
  options: LoadRecordFileOptions
): Promise<RecordFile | null> {
  const graph = await queryMemoryGraph(
    scope,
    { entityId: recordEntityId },
    options.store ?? defaultMemoryStore
  );
  const record = graph.entities.find(entity => entity.id === recordEntityId);
  if (!record || (record.type !== 'release' && record.type !== 'recording')) {
    return null;
  }

  const sourceRecordIds = [
    ...new Set(
      graph.observations
        .filter(
          observation =>
            observation.entityId === recordEntityId &&
            observation.status !== 'rejected' &&
            observation.sourceRecordId
        )
        .map(observation => observation.sourceRecordId as string)
    ),
  ];
  const sources = await (options.listSources ?? listRecordFileSources)(
    scope,
    sourceRecordIds
  );

  return buildRecordFile({
    record,
    sources,
    entities: graph.entities,
    edges: graph.edges,
    asOf: options.asOf,
    featureConsent: options.featureConsent,
  });
}
