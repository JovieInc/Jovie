import 'server-only';

import { defaultMemoryStore } from '@/lib/memory/drizzle-store';
import { buildEvidenceMetadata } from '@/lib/memory/evidence';
import { MemoryIdentityResolver } from '@/lib/memory/identity-resolver';
import type { MemoryScope, MemoryStore } from '@/lib/memory/types';
import type { ExtractedEntityMention, ExtractedEventFact } from './types';

export interface MemoryBridgeResult {
  readonly observationsCreated: number;
  readonly entitiesCreated: number;
}

export class ConnectorMemoryBridge {
  private readonly resolver: MemoryIdentityResolver;

  constructor(private readonly store: MemoryStore = defaultMemoryStore) {
    this.resolver = new MemoryIdentityResolver(store);
  }

  async bridgeEntityMentions(input: {
    readonly scope: MemoryScope;
    readonly sourceType: 'gmail_message' | 'calendar_event';
    readonly externalId: string;
    readonly sourceMetadata: Record<string, unknown>;
    readonly mentions: readonly ExtractedEntityMention[];
  }): Promise<MemoryBridgeResult> {
    if (input.mentions.length === 0) {
      return { observationsCreated: 0, entitiesCreated: 0 };
    }

    const sourceRecord = await this.store.upsertSourceRecord(input.scope, {
      sourceType: input.sourceType,
      externalId: input.externalId,
      metadata: input.sourceMetadata,
    });
    const evidence = [{ sourceRecordId: sourceRecord.id }];

    let observationsCreated = 0;
    let entitiesCreated = 0;

    for (const mention of input.mentions) {
      const resolved = await this.resolver.resolve(input.scope, {
        type: mention.type,
        name: mention.name,
        confidence: mention.confidence.toFixed(2),
        metadata: buildEvidenceMetadata(evidence, {
          connectorEnrichment: true,
          factKind: mention.factKind,
          ...(mention.metadata ?? {}),
        }),
        evidence,
      });

      if (resolved.created) entitiesCreated += 1;

      await this.store.createObservation(input.scope, {
        entityId: resolved.entityId,
        sourceRecordId: sourceRecord.id,
        fact: `${mention.name} mentioned in ${input.sourceType.replace('_', ' ')}`,
        confidence: mention.confidence.toFixed(2),
        metadata: buildEvidenceMetadata(evidence, {
          connectorEnrichment: true,
          factKind: mention.factKind,
        }),
      });
      observationsCreated += 1;
    }

    return { observationsCreated, entitiesCreated };
  }

  async bridgeEventFacts(input: {
    readonly scope: MemoryScope;
    readonly sourceType: 'gmail_message' | 'calendar_event';
    readonly externalId: string;
    readonly sourceMetadata: Record<string, unknown>;
    readonly events: readonly ExtractedEventFact[];
  }): Promise<MemoryBridgeResult> {
    if (input.events.length === 0) {
      return { observationsCreated: 0, entitiesCreated: 0 };
    }

    const sourceRecord = await this.store.upsertSourceRecord(input.scope, {
      sourceType: input.sourceType,
      externalId: input.externalId,
      metadata: input.sourceMetadata,
    });
    const evidence = [{ sourceRecordId: sourceRecord.id }];

    let observationsCreated = 0;
    let entitiesCreated = 0;

    for (const event of input.events) {
      const eventEntity = await this.resolver.resolve(input.scope, {
        type: 'event',
        name: event.title,
        confidence: event.confidence.toFixed(2),
        metadata: buildEvidenceMetadata(evidence, {
          connectorEnrichment: true,
          startsAt: event.startsAt,
          venueName: event.venueName,
        }),
        evidence,
      });

      if (eventEntity.created) entitiesCreated += 1;

      await this.store.createObservation(input.scope, {
        entityId: eventEntity.entityId,
        sourceRecordId: sourceRecord.id,
        fact: `Tour date signal: ${event.title} on ${event.startsAt}`,
        confidence: event.confidence.toFixed(2),
        metadata: buildEvidenceMetadata(evidence, {
          connectorEnrichment: true,
          kind: event.kind,
          startsAt: event.startsAt,
          venueName: event.venueName,
        }),
      });
      observationsCreated += 1;

      if (event.venueName) {
        const venue = await this.resolver.resolve(input.scope, {
          type: 'location',
          name: event.venueName,
          confidence: Math.min(event.confidence, 0.85).toFixed(2),
          metadata: buildEvidenceMetadata(evidence, {
            connectorEnrichment: true,
            city: event.city,
            country: event.country,
          }),
          evidence,
        });
        if (venue.created) entitiesCreated += 1;
      }
    }

    return { observationsCreated, entitiesCreated };
  }
}
