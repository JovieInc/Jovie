import { defaultMemoryStore } from './drizzle-store';
import {
  assertMemoryScope,
  buildEvidenceMetadata,
  sanitizeSourceInput,
} from './evidence';
import { MemoryIdentityResolver } from './identity-resolver';
import type {
  MemoryEntityCandidate,
  MemoryIngestResult,
  MemoryIngestSource,
  MemoryScope,
  MemoryStore,
} from './types';

export class MemoryIngestHarness {
  private readonly resolver: MemoryIdentityResolver;

  constructor(private readonly store: MemoryStore = defaultMemoryStore) {
    this.resolver = new MemoryIdentityResolver(store);
  }

  async ingest(
    scope: MemoryScope,
    sources: readonly MemoryIngestSource[]
  ): Promise<MemoryIngestResult> {
    assertMemoryScope(scope);
    const result: MutableMemoryIngestResult = {
      sourceRecords: [],
      entities: [],
      observations: [],
      assets: [],
      events: [],
      opportunities: [],
    };

    for (const source of sources) {
      const sourceRecord = await this.store.upsertSourceRecord(
        scope,
        sanitizeSourceInput(source.source)
      );
      result.sourceRecords.push(sourceRecord);
      const evidence = [{ sourceRecordId: sourceRecord.id }];

      for (const candidate of source.entities ?? []) {
        await this.resolveAndObserve(
          scope,
          withEvidence(candidate, evidence),
          `Mentioned ${candidate.name} in ${source.kind}`,
          result
        );
      }

      if (source.asset) {
        await this.ingestAsset(scope, source, sourceRecord.id, result);
      }

      if (source.event) {
        await this.ingestEvent(scope, source, sourceRecord.id, result);
      }

      if (source.catalogSong) {
        await this.ingestCatalogSong(scope, source, sourceRecord.id, result);
      }

      if (source.release) {
        await this.ingestRelease(scope, source, sourceRecord.id, result);
      }

      if (source.voiceMemo) {
        await this.ingestVoiceMemo(scope, source, sourceRecord.id, result);
      }
    }

    return result;
  }

  private async ingestAsset(
    scope: MemoryScope,
    source: MemoryIngestSource,
    sourceRecordId: string,
    result: MutableMemoryIngestResult
  ): Promise<void> {
    if (!source.asset) return;
    const evidence = [{ sourceRecordId }];
    const asset = await this.store.createAsset(scope, {
      kind: source.asset.kind,
      url: source.asset.url ?? null,
      storageKey: source.asset.storageKey ?? null,
      sourceRecordId,
      metadata: buildEvidenceMetadata(evidence, source.asset.metadata ?? {}),
    });
    result.assets.push(asset);

    for (const candidate of source.asset.mentions ?? []) {
      const resolved = await this.resolveAndObserve(
        scope,
        withEvidence(candidate, evidence),
        `${candidate.name} appears in ${source.asset.kind}`,
        result
      );
      await this.store.createAssetMention(scope, {
        assetId: asset.id,
        entityId: resolved.entityId,
        mentionType: 'detected',
        confidence: candidate.confidence ?? null,
        metadata: buildEvidenceMetadata(evidence, {
          sourceKind: source.kind,
        }),
      });
    }
  }

  private async ingestEvent(
    scope: MemoryScope,
    source: MemoryIngestSource,
    sourceRecordId: string,
    result: MutableMemoryIngestResult
  ): Promise<void> {
    if (!source.event) return;
    const evidence = [{ sourceRecordId }];
    const event = await this.store.createEvent(scope, {
      sourceRecordId,
      title: source.event.title,
      occurredAt: source.event.occurredAt
        ? new Date(source.event.occurredAt)
        : null,
      metadata: buildEvidenceMetadata(evidence, source.event.metadata ?? {}),
    });
    result.events.push(event);

    let locationEntityId: string | null = null;
    if (source.event.location) {
      const location = await this.resolveAndObserve(
        scope,
        withEvidence(source.event.location, evidence),
        `Event location is ${source.event.location.name}`,
        result
      );
      locationEntityId = location.entityId;
      await this.store.createEventParticipant(scope, {
        eventId: event.id,
        entityId: location.entityId,
        role: 'location',
        metadata: buildEvidenceMetadata(evidence),
      });
    }

    for (const participant of source.event.participants ?? []) {
      const resolved = await this.resolveAndObserve(
        scope,
        withEvidence(participant, evidence),
        `${participant.name} participated in ${source.event.title}`,
        result
      );
      await this.store.createEventParticipant(scope, {
        eventId: event.id,
        entityId: resolved.entityId,
        role: 'participant',
        metadata: buildEvidenceMetadata(evidence),
      });
      if (locationEntityId) {
        await this.store.createEdge(scope, {
          fromEntityId: resolved.entityId,
          toEntityId: locationEntityId,
          relation: 'attended_at_location',
          weight: participant.confidence ?? null,
          metadata: buildEvidenceMetadata(evidence, { eventId: event.id }),
        });
      }
    }
  }

  private async ingestCatalogSong(
    scope: MemoryScope,
    source: MemoryIngestSource,
    sourceRecordId: string,
    result: MutableMemoryIngestResult
  ): Promise<void> {
    if (!source.catalogSong) return;
    const evidence = [{ sourceRecordId }];
    const song = await this.resolveAndObserve(
      scope,
      withEvidence(
        {
          type: 'song',
          name: source.catalogSong.title,
          identities: source.catalogSong.externalIds,
          metadata: {
            ...(source.catalogSong.metadata ?? {}),
            catalogTitle: source.catalogSong.title,
          },
        },
        evidence
      ),
      `Catalog song exists: ${source.catalogSong.title}`,
      result
    );
    const artist = await this.resolveAndObserve(
      scope,
      withEvidence(source.catalogSong.artist, evidence),
      `Catalog song artist is ${source.catalogSong.artist.name}`,
      result
    );
    await this.store.createEdge(scope, {
      fromEntityId: artist.entityId,
      toEntityId: song.entityId,
      relation: 'recorded',
      metadata: buildEvidenceMetadata(evidence),
    });

    if (source.catalogSong.releaseTitle) {
      const release = await this.resolveAndObserve(
        scope,
        withEvidence(
          {
            type: 'release',
            name: source.catalogSong.releaseTitle,
            metadata: { catalogReleaseTitle: source.catalogSong.releaseTitle },
          },
          evidence
        ),
        `Catalog song appears on ${source.catalogSong.releaseTitle}`,
        result
      );
      await this.store.createEdge(scope, {
        fromEntityId: song.entityId,
        toEntityId: release.entityId,
        relation: 'appears_on_release',
        metadata: buildEvidenceMetadata(evidence),
      });
    }
  }

  private async ingestRelease(
    scope: MemoryScope,
    source: MemoryIngestSource,
    sourceRecordId: string,
    result: MutableMemoryIngestResult
  ): Promise<void> {
    if (!source.release) return;
    const evidence = [{ sourceRecordId }];
    const release = await this.resolveAndObserve(
      scope,
      withEvidence(
        {
          type: 'release',
          name: source.release.title,
          identities: source.release.externalIds,
          metadata: {
            ...(source.release.metadata ?? {}),
            releaseDate: source.release.releaseDate,
          },
        },
        evidence
      ),
      `Release ${source.release.title} is scheduled for ${source.release.releaseDate}`,
      result
    );
    const artist = await this.resolveAndObserve(
      scope,
      withEvidence(source.release.artist, evidence),
      `Release artist is ${source.release.artist.name}`,
      result
    );
    await this.store.createEdge(scope, {
      fromEntityId: artist.entityId,
      toEntityId: release.entityId,
      relation: 'released',
      metadata: buildEvidenceMetadata(evidence),
    });

    for (const songTitle of source.release.songs ?? []) {
      const song = await this.resolveAndObserve(
        scope,
        withEvidence({ type: 'song', name: songTitle }, evidence),
        `${songTitle} is on release ${source.release.title}`,
        result
      );
      await this.store.createEdge(scope, {
        fromEntityId: song.entityId,
        toEntityId: release.entityId,
        relation: 'appears_on_release',
        metadata: buildEvidenceMetadata(evidence),
      });
    }
  }

  private async ingestVoiceMemo(
    scope: MemoryScope,
    source: MemoryIngestSource,
    sourceRecordId: string,
    result: MutableMemoryIngestResult
  ): Promise<void> {
    if (!source.voiceMemo) return;
    const evidence = [{ sourceRecordId }];
    const asset = await this.store.createAsset(scope, {
      sourceRecordId,
      kind: 'voice_memo',
      storageKey: source.voiceMemo.storageKey ?? null,
      metadata: buildEvidenceMetadata(evidence, {
        ...(source.voiceMemo.metadata ?? {}),
        title: source.voiceMemo.title,
        songTitle: source.voiceMemo.songTitle,
        recordedAt: source.voiceMemo.recordedAt,
      }),
    });
    result.assets.push(asset);
    const recording = await this.resolveAndObserve(
      scope,
      withEvidence(
        {
          type: 'recording',
          name: source.voiceMemo.title,
          metadata: {
            recordedAt: source.voiceMemo.recordedAt,
            songTitle: source.voiceMemo.songTitle,
          },
        },
        evidence
      ),
      `Voice memo recorded: ${source.voiceMemo.title}`,
      result
    );
    await this.store.createAssetMention(scope, {
      assetId: asset.id,
      entityId: recording.entityId,
      mentionType: 'recording_asset',
      metadata: buildEvidenceMetadata(evidence),
    });

    if (source.voiceMemo.songTitle) {
      const song = await this.resolveAndObserve(
        scope,
        withEvidence(
          { type: 'song', name: source.voiceMemo.songTitle },
          evidence
        ),
        `Voice memo relates to song ${source.voiceMemo.songTitle}`,
        result
      );
      await this.store.createEdge(scope, {
        fromEntityId: recording.entityId,
        toEntityId: song.entityId,
        relation: 'voice_memo_for_song',
        metadata: buildEvidenceMetadata(evidence, { assetId: asset.id }),
      });
    }
  }

  private async resolveAndObserve(
    scope: MemoryScope,
    candidate: MemoryEntityCandidate,
    fact: string,
    result: MutableMemoryIngestResult
  ): Promise<{ readonly entityId: string }> {
    const resolved = await this.resolver.resolve(scope, candidate);
    const entity = await this.store.getEntity(scope, resolved.entityId);
    if (entity) result.entities.push(entity);
    const observation = await this.store.createObservation(scope, {
      entityId: resolved.entityId,
      sourceRecordId: candidate.evidence[0].sourceRecordId,
      fact,
      confidence: candidate.confidence,
      metadata: buildEvidenceMetadata(candidate.evidence, {
        source: 'memory_ingest_harness',
      }),
    });
    result.observations.push(observation);
    return { entityId: resolved.entityId };
  }
}

type CandidateWithoutEvidence = Omit<MemoryEntityCandidate, 'evidence'>;

interface MutableMemoryIngestResult {
  sourceRecords: MemoryIngestResult['sourceRecords'][number][];
  entities: MemoryIngestResult['entities'][number][];
  observations: MemoryIngestResult['observations'][number][];
  assets: MemoryIngestResult['assets'][number][];
  events: MemoryIngestResult['events'][number][];
  opportunities: MemoryIngestResult['opportunities'][number][];
}

function withEvidence(
  candidate: CandidateWithoutEvidence,
  evidence: MemoryEntityCandidate['evidence']
): MemoryEntityCandidate {
  return {
    ...candidate,
    evidence,
  };
}
