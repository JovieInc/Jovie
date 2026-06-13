/**
 * AgentHarness (JOV-2704 / gh-9869 v0 studio-session memory)
 *
 * Interface + memory-backed adapter for the studio-session memory loop.
 * v0: thin, explicit, provenance-first. No social/write scopes.
 * Uses MemoryIngestHarness + canonical memory schema (gh-9872).
 *
 * Called only when FEATURE_MEMORY_STUDIO_SESSION_V0 enabled (caller gate).
 * Every output carries evidence links + confidence + user scoping.
 */

import { captureError } from '@/lib/error-tracking';
import { defaultMemoryStore } from '@/lib/memory/drizzle-store';
import { buildEvidenceMetadata } from '@/lib/memory/evidence';
import { MemoryIngestHarness } from '@/lib/memory/ingest-harness';
import type {
  MemoryIngestResult,
  MemoryIngestSource,
  MemoryScope,
  MemoryStore,
} from '@/lib/memory/types';
import { logger } from '@/lib/utils/logger';

export interface StudioSessionInput {
  userId: string;
  creatorProfileId: string;
  /** e.g. photo tag context or external trigger payload */
  triggerContext: Record<string, unknown>;
  /** Prior memory source record ids for lineage */
  sourceContextFactIds?: string[];
  /** Optional correlation hints (gmail thread ids, calendar event ids) */
  nearbyContextRefs?: string[];
}

export interface StudioSessionResult {
  studioSessionId: string;
  personRef?: { id: string; name?: string; confidence: number };
  evidence: Array<{
    factId?: string;
    kind: string;
    sourceRefs: string[];
    confidence: number;
    data: Record<string, unknown>;
  }>;
  opportunityRef?: {
    id: string;
    kind: 'content_opportunity';
    approvalGated: true;
  };
  provenance: {
    triggeredAt: string;
    sources: string[];
    flag: 'MEMORY_STUDIO_SESSION_V0';
  };
}

export interface AgentHarness {
  runStudioSessionMemoryLoop(
    input: StudioSessionInput
  ): Promise<StudioSessionResult>;
}

function parseNearbyContextRef(ref: string): {
  sourceType: 'gmail_message' | 'calendar_event';
  externalId: string;
} | null {
  if (ref.startsWith('gmail:')) {
    return {
      sourceType: 'gmail_message',
      externalId: ref.slice('gmail:'.length),
    };
  }
  if (ref.startsWith('cal:')) {
    return {
      sourceType: 'calendar_event',
      externalId: ref.slice('cal:'.length),
    };
  }
  return null;
}

function buildIngestSources(input: StudioSessionInput): MemoryIngestSource[] {
  const {
    triggerContext,
    sourceContextFactIds = [],
    nearbyContextRefs = [],
  } = input;
  const photoId = String(triggerContext.photoId ?? 'unknown');
  const personName =
    (triggerContext.personName as string) ||
    (triggerContext.taggedName as string) ||
    'Unknown Person';
  const locationName =
    (triggerContext.location as string) ||
    (triggerContext.locationName as string) ||
    undefined;
  const sessionTs =
    (triggerContext.sessionTs as string) || new Date().toISOString();

  const sources: MemoryIngestSource[] = [
    {
      kind: 'photo',
      source: {
        sourceType: 'uploaded_asset',
        externalId: `photo_tag:${photoId}`,
        metadata: {
          ...triggerContext,
          phase: 'studio_session_v0_trigger',
          lineageSourceRecordIds: sourceContextFactIds,
        },
      },
      asset: {
        kind: 'photo',
        storageKey:
          (triggerContext.storageKey as string) ||
          (Array.isArray(triggerContext.assetIds)
            ? String(triggerContext.assetIds[0])
            : undefined) ||
          null,
        metadata: {
          photoId,
          taggedName: personName,
          locationName,
          sessionTs,
        },
        mentions: [
          {
            type: 'person',
            name: personName,
            confidence: '0.82',
            metadata: { origin: 'photo_tag_v0' },
          },
        ],
      },
    },
  ];

  for (const ref of nearbyContextRefs) {
    const parsed = parseNearbyContextRef(ref);
    if (!parsed) continue;

    if (parsed.sourceType === 'calendar_event') {
      sources.push({
        kind: 'calendar_event',
        source: {
          sourceType: 'calendar_event',
          externalId: parsed.externalId,
          metadata: {
            provider: 'google_calendar',
            correlationRef: ref,
            phase: 'context_correlation_v0',
          },
        },
        event: {
          title: locationName
            ? `Studio session at ${locationName}`
            : 'Studio session (correlated calendar event)',
          occurredAt: sessionTs,
          location: locationName
            ? {
                type: 'location',
                name: locationName,
                confidence: '0.70',
              }
            : undefined,
          participants: [
            {
              type: 'person',
              name: personName,
              confidence: '0.70',
            },
          ],
          metadata: {
            studioSessionLink: true,
            correlationRef: ref,
          },
        },
      });
      continue;
    }

    sources.push({
      kind: 'chat',
      source: {
        sourceType: 'gmail_message',
        externalId: parsed.externalId,
        metadata: {
          provider: 'gmail',
          correlationRef: ref,
          phase: 'context_correlation_v0',
          studioSessionLink: true,
        },
      },
      entities: [
        {
          type: 'person',
          name: personName,
          confidence: '0.65',
          metadata: { correlationRef: ref },
        },
      ],
    });
  }

  if (!nearbyContextRefs.some(ref => ref.startsWith('cal:'))) {
    sources.push({
      kind: 'calendar_event',
      source: {
        sourceType: 'manual',
        externalId: `studio_session:${photoId}:${sessionTs}`,
        metadata: {
          phase: 'studio_session_v0_event',
          locationName,
          songRef: triggerContext.songRef,
        },
      },
      event: {
        title: locationName
          ? `Studio session at ${locationName}`
          : 'Studio session',
        occurredAt: sessionTs,
        location: locationName
          ? {
              type: locationName.toLowerCase().includes('studio')
                ? 'studio'
                : 'location',
              name: locationName,
              confidence: '0.75',
            }
          : undefined,
        participants: [
          {
            type: 'person',
            name: personName,
            confidence: '0.82',
          },
        ],
        metadata: {
          songRef: triggerContext.songRef,
          assetIds: triggerContext.assetIds,
          note: triggerContext.note,
        },
      },
    });
  }

  return sources;
}

function mapIngestResultToEvidence(
  ingest: MemoryIngestResult
): StudioSessionResult['evidence'] {
  const evidence: StudioSessionResult['evidence'] = [];

  for (const sourceRecord of ingest.sourceRecords) {
    evidence.push({
      factId: sourceRecord.id,
      kind: `source:${sourceRecord.sourceType}`,
      sourceRefs: [sourceRecord.externalId ?? sourceRecord.id],
      confidence: 0.95,
      data: {
        sourceType: sourceRecord.sourceType,
        metadata: sourceRecord.metadata ?? {},
      },
    });
  }

  for (const observation of ingest.observations) {
    evidence.push({
      factId: observation.id,
      kind: 'observation',
      sourceRefs: observation.sourceRecordId
        ? [observation.sourceRecordId]
        : [],
      confidence: Number.parseFloat(observation.confidence ?? '0.8') || 0.8,
      data: {
        fact: observation.fact,
        entityId: observation.entityId,
        status: observation.status,
        metadata: observation.metadata ?? {},
      },
    });
  }

  for (const event of ingest.events) {
    evidence.push({
      factId: event.id,
      kind: 'studio_session_event',
      sourceRefs: event.sourceRecordId ? [event.sourceRecordId] : [],
      confidence: 0.75,
      data: {
        title: event.title,
        occurredAt: event.occurredAt,
        metadata: event.metadata ?? {},
      },
    });
  }

  return evidence;
}

/**
 * Memory-backed v0 adapter. Uses MemoryIngestHarness for person enrichment,
 * context correlation, studio-session events, and approval-gated opportunities.
 */
export class MemoryStudioSessionAdapter implements AgentHarness {
  private readonly ingestHarness: MemoryIngestHarness;
  private readonly store: MemoryStore;

  constructor(store: MemoryStore = defaultMemoryStore) {
    this.store = store;
    this.ingestHarness = new MemoryIngestHarness(store);
  }

  async runStudioSessionMemoryLoop(
    input: StudioSessionInput
  ): Promise<StudioSessionResult> {
    const {
      userId,
      creatorProfileId,
      triggerContext,
      sourceContextFactIds = [],
      nearbyContextRefs = [],
    } = input;

    logger.info('[agent-harness] studio-session memory loop start (v0)', {
      userId,
      creatorProfileId,
      triggerKeys: Object.keys(triggerContext),
    });

    const now = new Date().toISOString();
    const scope: MemoryScope = { userId, creatorProfileId };

    try {
      const ingest = await this.ingestHarness.ingest(
        scope,
        buildIngestSources(input)
      );

      const personEntity = ingest.entities.find(
        entity => entity.type === 'person' || entity.type === 'artist'
      );
      const personRef = personEntity
        ? {
            id: personEntity.id,
            name: personEntity.primaryName ?? undefined,
            confidence:
              Number.parseFloat(
                (personEntity.metadata?.confidence as string) ?? '0.82'
              ) || 0.82,
          }
        : undefined;

      const studioEvent =
        ingest.events.find(event =>
          String(event.title ?? '')
            .toLowerCase()
            .includes('studio session')
        ) ?? ingest.events[0];
      const studioSessionId = studioEvent?.id ?? `studio_sess_v0_${Date.now()}`;

      const evidence = mapIngestResultToEvidence(ingest);
      const primarySourceRecordId = ingest.sourceRecords[0]?.id;
      const opportunityEvidence = primarySourceRecordId
        ? [{ sourceRecordId: primarySourceRecordId }]
        : [];

      const opportunity = await this.store.createOpportunity(scope, {
        entityId: personRef?.id ?? null,
        title: personRef?.name
          ? `Create content from studio session with ${personRef.name}`
          : 'Create content from studio session',
        description:
          'Approval-gated content opportunity proposed by studio-session memory loop v0.',
        metadata: buildEvidenceMetadata(opportunityEvidence, {
          kind: 'studio_session_content_opportunity',
          dedupKey: `studio_session:${studioSessionId}`,
          studioSessionId,
          suggestedActionKind: 'create_content_from_studio_session',
          approvalRequired: true,
          approvalGated: true,
          provenanceNote:
            'JOV-2704 v0 loop — memory schema facts with sourceRecord lineage + user scope',
          triggerContext,
        }),
      });

      evidence.push({
        factId: opportunity.id,
        kind: 'content_opportunity',
        sourceRefs: evidence.flatMap(item => item.sourceRefs),
        confidence: 0.75,
        data: {
          studioSessionId,
          personRef,
          title: opportunity.title,
          status: opportunity.status,
          approvalGated: true,
          metadata: opportunity.metadata ?? {},
        },
      });

      const result: StudioSessionResult = {
        studioSessionId,
        personRef,
        evidence,
        opportunityRef: {
          id: opportunity.id,
          kind: 'content_opportunity',
          approvalGated: true,
        },
        provenance: {
          triggeredAt: now,
          sources: [...sourceContextFactIds, ...nearbyContextRefs],
          flag: 'MEMORY_STUDIO_SESSION_V0',
        },
      };

      logger.info('[agent-harness] studio-session memory loop complete (v0)', {
        userId,
        studioSessionId,
        evidenceCount: evidence.length,
        opportunityId: opportunity.id,
      });

      return result;
    } catch (err) {
      captureError('agent-harness studio-session v0 failed', err, {
        userId,
        creatorProfileId,
        triggerContext,
      });
      throw err;
    }
  }
}

// Default export for convenience in runner
export const defaultAgentHarness: AgentHarness =
  new MemoryStudioSessionAdapter();
