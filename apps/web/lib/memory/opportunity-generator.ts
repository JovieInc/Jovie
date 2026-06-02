import type { MemoryAsset } from '@/lib/db/schema/memory';
import { defaultMemoryStore } from './drizzle-store';
import { assertMemoryScope, buildEvidenceMetadata } from './evidence';
import type {
  MemoryGraphSnapshot,
  MemoryOpportunityInput,
  MemoryScope,
  MemoryStore,
} from './types';

export interface GenerateMemoryOpportunitiesInput {
  readonly now?: Date;
}

export interface GenerateMemoryOpportunitiesResult {
  readonly opportunityIds: readonly string[];
}

export class MemoryOpportunityGenerator {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async generate(
    scope: MemoryScope,
    input: GenerateMemoryOpportunitiesInput = {}
  ): Promise<GenerateMemoryOpportunitiesResult> {
    assertMemoryScope(scope);
    const now = input.now ?? new Date();
    const graph = await this.store.getGraph(scope);
    const opportunities: string[] = [];

    for (const opportunity of [
      ...this.buildBirthdayOpportunities(graph, now),
      ...this.buildReleaseOpportunities(graph, now),
    ]) {
      const created = await this.store.createOpportunity(scope, opportunity);
      opportunities.push(created.id);
    }

    return { opportunityIds: opportunities };
  }

  private buildBirthdayOpportunities(
    graph: MemoryGraphSnapshot,
    now: Date
  ): MemoryOpportunityInput[] {
    return graph.entities
      .filter(entity => entity.type === 'person' || entity.type === 'artist')
      .flatMap(entity => {
        const birthDate = getEnrichmentString(entity.metadata, 'birthDate');
        if (!birthDate || !sameMonthDay(birthDate, now)) return [];
        const asset = findPhotoAssetForEntity(graph, entity.id);
        const sourceRecordId = asset?.sourceRecordId;
        if (!sourceRecordId) return [];

        return [
          {
            entityId: entity.id,
            title: `Post your photo with ${entity.primaryName}`,
            description: `Today is ${entity.primaryName}'s birthday. Review the linked asset and decide whether to post it.`,
            metadata: buildEvidenceMetadata([{ sourceRecordId }], {
              kind: 'birthday_social_post',
              dedupKey: `birthday:${entity.id}:${dateKey(now)}`,
              assetId: asset.id,
              approvalRequired: true,
            }),
          },
        ];
      });
  }

  private buildReleaseOpportunities(
    graph: MemoryGraphSnapshot,
    now: Date
  ): MemoryOpportunityInput[] {
    return graph.entities
      .filter(entity => entity.type === 'release')
      .flatMap(release => {
        const releaseDate =
          getNestedString(release.metadata, ['releaseDate']) ??
          getEnrichmentString(release.metadata, 'releaseDate');
        if (!releaseDate || !isNearDate(releaseDate, now, 7)) return [];

        const artistEdge = graph.edges.find(
          edge => edge.toEntityId === release.id && edge.relation === 'released'
        );
        const artist = artistEdge
          ? graph.entities.find(entity => entity.id === artistEdge.fromEntityId)
          : null;
        if (!artist) return [];

        const asset = findPhotoAssetForEntity(graph, artist.id);
        const sourceRecordId = asset?.sourceRecordId;
        if (!sourceRecordId) return [];

        return [
          {
            entityId: artist.id,
            title: `Shout ${artist.primaryName}'s new release`,
            description: `Here's your photo with ${artist.primaryName}. Post this and shout ${release.primaryName}.`,
            metadata: buildEvidenceMetadata([{ sourceRecordId }], {
              kind: 'release_social_post',
              dedupKey: `release:${release.id}:${dateKey(new Date(releaseDate))}`,
              assetId: asset.id,
              releaseEntityId: release.id,
              approvalRequired: true,
            }),
          },
        ];
      });
  }
}

function getEnrichmentString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  const direct = getNestedString(metadata, ['enrichment', key]);
  if (direct) return direct;

  const enrichment = getNestedRecord(metadata, ['enrichment']);
  if (!enrichment) return null;
  for (const value of Object.values(enrichment)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = (value as Record<string, unknown>)[key];
    if (typeof nested === 'string' && nested.length > 0) return nested;
  }
  return null;
}

function getNestedRecord(
  value: Record<string, unknown> | null,
  path: readonly string[]
): Record<string, unknown> | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return null;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor && typeof cursor === 'object' && !Array.isArray(cursor)
    ? (cursor as Record<string, unknown>)
    : null;
}

function findPhotoAssetForEntity(
  graph: MemoryGraphSnapshot,
  entityId: string
): MemoryAsset | null {
  for (const mention of graph.assetMentions.filter(
    row => row.entityId === entityId
  )) {
    const asset = graph.assets.find(row => row.id === mention.assetId);
    if (asset?.kind === 'photo' || asset?.kind === 'profile_photo') {
      return asset;
    }
  }
  return null;
}

function getNestedString(
  value: Record<string, unknown> | null,
  path: readonly string[]
): string | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

function sameMonthDay(date: string, now: Date): boolean {
  const parsed = new Date(date);
  return (
    parsed.getUTCMonth() === now.getUTCMonth() &&
    parsed.getUTCDate() === now.getUTCDate()
  );
}

function isNearDate(date: string, now: Date, days: number): boolean {
  const parsed = new Date(date);
  const ms = Math.abs(parsed.getTime() - now.getTime());
  return ms <= days * 24 * 60 * 60 * 1000;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
