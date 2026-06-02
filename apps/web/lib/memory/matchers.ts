import type { MemoryAsset, MemoryEntity } from '@/lib/db/schema/memory';
import { defaultMemoryStore } from './drizzle-store';
import {
  assertMemoryScope,
  buildEvidenceMetadata,
  normalizeMemoryName,
} from './evidence';
import type { MemoryGraphSnapshot, MemoryScope, MemoryStore } from './types';

export interface MemoryMatcherResult {
  readonly edgeCount: number;
  readonly observationCount: number;
  readonly opportunityIds: readonly string[];
}

export class MemoryCalendarLocationPhotoMatcher {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async match(scope: MemoryScope): Promise<MemoryMatcherResult> {
    assertMemoryScope(scope);
    const graph = await this.store.getGraph(scope);
    let edgeCount = 0;
    let observationCount = 0;

    for (const event of graph.events) {
      const eventLocation = getMetadataString(event.metadata, 'locationName');
      const eventTime = event.occurredAt;
      if (!eventLocation || !eventTime || !event.sourceRecordId) continue;

      const photo = graph.assets.find(asset =>
        isPhotoAtLocationNearEvent(asset, eventLocation, eventTime)
      );
      if (!photo?.sourceRecordId) continue;

      const location = findLocationEntity(graph, eventLocation);
      if (!location) continue;

      await this.store.createEdge(scope, {
        fromEntityId: location.id,
        toEntityId: location.id,
        relation: 'calendar_photo_location_match',
        weight: '0.82',
        metadata: buildEvidenceMetadata(
          [
            { sourceRecordId: event.sourceRecordId },
            { sourceRecordId: photo.sourceRecordId },
          ],
          { eventId: event.id, assetId: photo.id }
        ),
      });
      edgeCount += 1;
      const observation = await this.store.createObservation(scope, {
        entityId: location.id,
        sourceRecordId: event.sourceRecordId,
        fact: `Calendar event and photo both reference ${eventLocation}`,
        confidence: '0.82',
        metadata: buildEvidenceMetadata(
          [
            { sourceRecordId: event.sourceRecordId },
            { sourceRecordId: photo.sourceRecordId },
          ],
          { assetId: photo.id, eventId: event.id }
        ),
      });
      observationCount += observation ? 1 : 0;
    }

    return { edgeCount, observationCount, opportunityIds: [] };
  }
}

export class MemoryCatalogVoiceMemoMatcher {
  constructor(private readonly store: MemoryStore = defaultMemoryStore) {}

  async match(scope: MemoryScope): Promise<MemoryMatcherResult> {
    assertMemoryScope(scope);
    const graph = await this.store.getGraph(scope);
    let edgeCount = 0;
    let observationCount = 0;
    const opportunityIds: string[] = [];

    for (const voiceMemo of graph.assets.filter(
      asset => asset.kind === 'voice_memo'
    )) {
      const songTitle = getMetadataString(voiceMemo.metadata, 'songTitle');
      if (!songTitle || !voiceMemo.sourceRecordId) continue;
      const song = graph.entities.find(
        entity =>
          entity.type === 'song' &&
          normalizeMemoryName(entity.primaryName ?? '') ===
            normalizeMemoryName(songTitle)
      );
      if (!song) continue;
      const recordingMention = graph.assetMentions.find(
        mention => mention.assetId === voiceMemo.id
      );
      const recording = recordingMention
        ? graph.entities.find(entity => entity.id === recordingMention.entityId)
        : null;
      if (!recording) continue;

      await this.store.createEdge(scope, {
        fromEntityId: recording.id,
        toEntityId: song.id,
        relation: 'voice_memo_for_song',
        weight: '0.86',
        metadata: buildEvidenceMetadata(
          [{ sourceRecordId: voiceMemo.sourceRecordId }],
          {
            assetId: voiceMemo.id,
          }
        ),
      });
      edgeCount += 1;
      const observation = await this.store.createObservation(scope, {
        entityId: song.id,
        sourceRecordId: voiceMemo.sourceRecordId,
        fact: `Voice memo ${voiceMemo.storageKey ?? voiceMemo.id} relates to ${songTitle}`,
        confidence: '0.86',
        metadata: buildEvidenceMetadata(
          [{ sourceRecordId: voiceMemo.sourceRecordId }],
          {
            assetId: voiceMemo.id,
          }
        ),
      });
      observationCount += observation ? 1 : 0;

      const release = findReleaseForSong(graph, song);
      if (release) {
        const opportunity = await this.store.createOpportunity(scope, {
          entityId: song.id,
          title: `Use voice memo for ${song.primaryName}`,
          description: `${song.primaryName} has a related voice memo. Review it as release-day social content.`,
          metadata: buildEvidenceMetadata(
            [{ sourceRecordId: voiceMemo.sourceRecordId }],
            {
              kind: 'voice_memo_release_content',
              dedupKey: `voice-memo:${voiceMemo.id}:${release.id}`,
              assetId: voiceMemo.id,
              releaseEntityId: release.id,
              approvalRequired: true,
            }
          ),
        });
        opportunityIds.push(opportunity.id);
      }
    }

    return { edgeCount, observationCount, opportunityIds };
  }
}

function findLocationEntity(
  graph: MemoryGraphSnapshot,
  locationName: string
): MemoryEntity | null {
  const normalized = normalizeMemoryName(locationName);
  return (
    graph.entities.find(
      entity =>
        entity.type === 'location' &&
        normalizeMemoryName(entity.primaryName ?? '') === normalized
    ) ?? null
  );
}

function isPhotoAtLocationNearEvent(
  asset: MemoryAsset,
  locationName: string,
  eventTime: Date
): boolean {
  if (asset.kind !== 'photo' && asset.kind !== 'profile_photo') return false;
  const assetLocation = getMetadataString(asset.metadata, 'locationName');
  const capturedAt = getMetadataString(asset.metadata, 'capturedAt');
  if (!assetLocation || !capturedAt) return false;
  return (
    normalizeMemoryName(assetLocation) === normalizeMemoryName(locationName) &&
    Math.abs(new Date(capturedAt).getTime() - eventTime.getTime()) <=
      24 * 60 * 60 * 1000
  );
}

function findReleaseForSong(
  graph: MemoryGraphSnapshot,
  song: MemoryEntity
): MemoryEntity | null {
  const edge = graph.edges.find(
    row => row.fromEntityId === song.id && row.relation === 'appears_on_release'
  );
  if (!edge) return null;
  return (
    graph.entities.find(
      entity => entity.id === edge.toEntityId && entity.type === 'release'
    ) ?? null
  );
}

function getMetadataString(
  value: Record<string, unknown> | null,
  key: string
): string | null {
  const result = value?.[key];
  return typeof result === 'string' && result.length > 0 ? result : null;
}
