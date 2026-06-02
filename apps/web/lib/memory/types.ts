import type {
  MemoryAsset,
  MemoryAssetEntityMention,
  MemoryEnrichmentJob,
  MemoryEntity,
  MemoryEntityAlias,
  MemoryEntityEdge,
  MemoryEntityIdentity,
  MemoryEntityStatus,
  MemoryEntityType,
  MemoryEvent,
  MemoryEventParticipant,
  MemoryObservation,
  MemoryObservationStatus,
  MemoryOpportunity,
  MemoryOpportunityStatus,
  MemorySourceRecord,
  MemorySourceType,
} from '@/lib/db/schema/memory';

export interface MemoryScope {
  readonly userId: string;
  readonly creatorProfileId: string;
}

export interface MemoryEvidenceRef {
  readonly sourceRecordId: string;
  readonly note?: string;
}

export interface MemoryProviderIdentityInput {
  readonly provider: string;
  readonly providerId: string;
  readonly confidence?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryEntityCandidate {
  readonly type: MemoryEntityType;
  readonly name: string;
  readonly status?: MemoryEntityStatus;
  readonly aliases?: readonly string[];
  readonly identities?: readonly MemoryProviderIdentityInput[];
  readonly confidence?: string;
  readonly metadata?: Record<string, unknown>;
  readonly evidence: readonly MemoryEvidenceRef[];
}

export interface MemorySourceInput {
  readonly sourceType: MemorySourceType;
  readonly externalId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryAssetInput {
  readonly kind: string;
  readonly url?: string | null;
  readonly storageKey?: string | null;
  readonly sourceRecordId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryObservationInput {
  readonly entityId: string;
  readonly sourceRecordId: string;
  readonly fact: string;
  readonly confidence?: string;
  readonly metadata?: Record<string, unknown>;
  readonly status?: MemoryObservationStatus;
}

export interface MemoryEdgeInput {
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly relation: string;
  readonly weight?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryAssetMentionInput {
  readonly assetId: string;
  readonly entityId: string;
  readonly mentionType?: string | null;
  readonly confidence?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryEventInput {
  readonly sourceRecordId: string;
  readonly title?: string | null;
  readonly occurredAt?: Date | null;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryEventParticipantInput {
  readonly eventId: string;
  readonly entityId: string;
  readonly role?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryEnrichmentJobInput {
  readonly targetEntityId: string;
  readonly jobType: string;
  readonly input?: Record<string, unknown>;
  readonly status?: string;
}

export interface MemoryOpportunityInput {
  readonly entityId?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface MemoryGraphSnapshot {
  readonly entities: readonly MemoryEntity[];
  readonly aliases: readonly MemoryEntityAlias[];
  readonly identities: readonly MemoryEntityIdentity[];
  readonly observations: readonly MemoryObservation[];
  readonly edges: readonly MemoryEntityEdge[];
  readonly assets: readonly MemoryAsset[];
  readonly assetMentions: readonly MemoryAssetEntityMention[];
  readonly events: readonly MemoryEvent[];
  readonly eventParticipants: readonly MemoryEventParticipant[];
  readonly opportunities: readonly MemoryOpportunity[];
}

export interface MemoryStore {
  upsertSourceRecord(
    scope: MemoryScope,
    input: MemorySourceInput
  ): Promise<MemorySourceRecord>;
  createAsset(
    scope: MemoryScope,
    input: MemoryAssetInput
  ): Promise<MemoryAsset>;
  findEntityByIdentity(
    scope: MemoryScope,
    identity: Pick<MemoryProviderIdentityInput, 'provider' | 'providerId'>
  ): Promise<MemoryEntity | null>;
  findEntityByName(
    scope: MemoryScope,
    type: MemoryEntityType,
    name: string
  ): Promise<MemoryEntity | null>;
  getEntity(scope: MemoryScope, entityId: string): Promise<MemoryEntity | null>;
  createEntity(
    scope: MemoryScope,
    input: Pick<MemoryEntityCandidate, 'type' | 'name' | 'status' | 'metadata'>
  ): Promise<MemoryEntity>;
  updateEntity(
    scope: MemoryScope,
    entityId: string,
    input: {
      readonly status?: MemoryEntityStatus;
      readonly metadata?: Record<string, unknown>;
      readonly primaryName?: string | null;
    }
  ): Promise<MemoryEntity>;
  addEntityIdentity(
    scope: MemoryScope,
    entityId: string,
    input: MemoryProviderIdentityInput
  ): Promise<MemoryEntityIdentity>;
  addEntityAlias(
    scope: MemoryScope,
    entityId: string,
    alias: string,
    source?: string | null
  ): Promise<MemoryEntityAlias>;
  createObservation(
    scope: MemoryScope,
    input: MemoryObservationInput
  ): Promise<MemoryObservation>;
  updateObservationStatus(
    scope: MemoryScope,
    observationId: string,
    status: MemoryObservationStatus
  ): Promise<MemoryObservation>;
  createEdge(
    scope: MemoryScope,
    input: MemoryEdgeInput
  ): Promise<MemoryEntityEdge>;
  createAssetMention(
    scope: MemoryScope,
    input: MemoryAssetMentionInput
  ): Promise<MemoryAssetEntityMention>;
  createEvent(
    scope: MemoryScope,
    input: MemoryEventInput
  ): Promise<MemoryEvent>;
  createEventParticipant(
    scope: MemoryScope,
    input: MemoryEventParticipantInput
  ): Promise<MemoryEventParticipant>;
  createEnrichmentJob(
    scope: MemoryScope,
    input: MemoryEnrichmentJobInput
  ): Promise<MemoryEnrichmentJob>;
  completeEnrichmentJob(
    scope: MemoryScope,
    jobId: string,
    output: Record<string, unknown>,
    status?: string
  ): Promise<MemoryEnrichmentJob>;
  createOpportunity(
    scope: MemoryScope,
    input: MemoryOpportunityInput
  ): Promise<MemoryOpportunity>;
  updateOpportunityStatus(
    scope: MemoryScope,
    opportunityId: string,
    status: MemoryOpportunityStatus
  ): Promise<MemoryOpportunity>;
  getGraph(scope: MemoryScope, entityId?: string): Promise<MemoryGraphSnapshot>;
}

export type MemoryIngestSourceKind =
  | 'chat'
  | 'photo'
  | 'calendar_event'
  | 'catalog_song'
  | 'release'
  | 'voice_memo';

export interface MemoryIngestSource {
  readonly kind: MemoryIngestSourceKind;
  readonly source: MemorySourceInput;
  readonly entities?: readonly Omit<MemoryEntityCandidate, 'evidence'>[];
  readonly asset?: Omit<MemoryAssetInput, 'sourceRecordId'> & {
    readonly mentions?: readonly Omit<MemoryEntityCandidate, 'evidence'>[];
  };
  readonly event?: {
    readonly title: string;
    readonly occurredAt?: string;
    readonly location?: Omit<MemoryEntityCandidate, 'evidence'>;
    readonly participants?: readonly Omit<MemoryEntityCandidate, 'evidence'>[];
    readonly metadata?: Record<string, unknown>;
  };
  readonly catalogSong?: {
    readonly title: string;
    readonly artist: Omit<MemoryEntityCandidate, 'evidence'>;
    readonly releaseTitle?: string;
    readonly externalIds?: readonly MemoryProviderIdentityInput[];
    readonly metadata?: Record<string, unknown>;
  };
  readonly release?: {
    readonly title: string;
    readonly artist: Omit<MemoryEntityCandidate, 'evidence'>;
    readonly releaseDate: string;
    readonly songs?: readonly string[];
    readonly externalIds?: readonly MemoryProviderIdentityInput[];
    readonly metadata?: Record<string, unknown>;
  };
  readonly voiceMemo?: {
    readonly title: string;
    readonly songTitle?: string;
    readonly recordedAt?: string;
    readonly storageKey?: string;
    readonly metadata?: Record<string, unknown>;
  };
}

export interface MemoryIngestResult {
  readonly sourceRecords: readonly MemorySourceRecord[];
  readonly entities: readonly MemoryEntity[];
  readonly observations: readonly MemoryObservation[];
  readonly assets: readonly MemoryAsset[];
  readonly events: readonly MemoryEvent[];
  readonly opportunities: readonly MemoryOpportunity[];
}

export interface MemoryEnrichmentProviderResponse {
  readonly provider: string;
  readonly providerId: string;
  readonly sourceUrl?: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description?: string;
  readonly birthDate?: string;
  readonly releaseDate?: string;
  readonly identities?: readonly MemoryProviderIdentityInput[];
  readonly facts?: readonly {
    readonly fact: string;
    readonly confidence?: string;
    readonly metadata?: Record<string, unknown>;
  }[];
  readonly metadata?: Record<string, unknown>;
}
