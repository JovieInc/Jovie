import type { ConnectorProviderId } from '@/lib/connectors/types';
import type { ContextFact } from '@/lib/db/schema/connectors';
import type { MemoryEntityType } from '@/lib/db/schema/memory';

/** Scope required for connector enrichment + memory graph writes. */
export interface ConnectorEnrichmentScope {
  readonly userId: string;
  readonly creatorProfileId: string;
}

export interface ConnectorEnrichmentAccountContext {
  readonly scope: ConnectorEnrichmentScope;
  readonly gmailAccountId: string | null;
  readonly calendarAccountId: string | null;
}

export type ConnectorEnrichmentProviderId = Extract<
  ConnectorProviderId,
  'gmail' | 'google_calendar'
>;

export interface ExtractedEntityMention {
  readonly type: MemoryEntityType;
  readonly name: string;
  readonly confidence: number;
  readonly factKind:
    | 'person_mentioned'
    | 'song_mentioned'
    | 'location_mentioned'
    | 'studio_location';
  readonly metadata?: Record<string, unknown>;
}

export interface ExtractedEventFact {
  readonly kind: 'event_signal' | 'tour_date_known';
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly venueName?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly country?: string | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly sourceRefs: readonly Record<string, unknown>[];
}

export interface ConnectorEnrichmentPipelineResult {
  readonly provider: ConnectorEnrichmentProviderId;
  readonly externalObjectsProcessed: number;
  readonly contextFactsCreated: number;
  readonly memoryObservationsCreated: number;
  readonly memoryEntitiesCreated: number;
  readonly suggestionsCreated: number;
}

export interface ConnectorEnrichmentRunResult {
  readonly pipelines: readonly ConnectorEnrichmentPipelineResult[];
  readonly totalSuggestionsCreated: number;
}

export interface ConnectorEnrichmentPipeline {
  readonly provider: ConnectorEnrichmentProviderId;
  run(
    context: ConnectorEnrichmentAccountContext
  ): Promise<ConnectorEnrichmentPipelineResult>;
}

export type PersistedContextFact = Pick<
  ContextFact,
  'id' | 'kind' | 'data' | 'confidence' | 'sourceObjectId'
>;
