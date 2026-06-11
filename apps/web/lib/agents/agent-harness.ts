/**
 * AgentHarness (gh-9869 v0 studio-session memory)
 *
 * Interface + OpenAI Agents SDK adapter stub for the memory loop.
 * v0: thin, explicit, provenance-first. No social/write scopes.
 * Future: swap in real @openai/agents or Vercel AI SDK agent.
 *
 * Called only when FEATURE_MEMORY_STUDIO_SESSION_V0 enabled (caller gate).
 * Every output carries evidence links + confidence + user scoping.
 *
 * Memory writes use memory.ts tables via MemoryStore — not context_facts
 * (connectors skill/extraction layer).
 */

import { captureError } from '@/lib/error-tracking';
import { defaultMemoryStore, MemoryIdentityResolver } from '@/lib/memory';
import {
  assertMemoryScope,
  buildEvidenceMetadata,
} from '@/lib/memory/evidence';
import type { MemoryScope, MemoryStore } from '@/lib/memory/types';
import { logger } from '@/lib/utils/logger';

export interface StudioSessionInput {
  userId: string;
  creatorProfileId: string;
  /** e.g. photo tag context or external trigger payload */
  triggerContext: Record<string, unknown>;
  /** Prior memory source record ids for lineage */
  sourceMemoryRecordIds?: string[];
  /** Optional correlation hints (gmail thread ids, calendar event ids) */
  nearbyContextRefs?: string[];
}

export interface StudioSessionResult {
  studioSessionId: string;
  personRef?: { id: string; name?: string; confidence: number };
  evidence: Array<{
    observationId?: string;
    sourceRecordId?: string;
    entityId?: string;
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

function memoryScope(input: StudioSessionInput): MemoryScope {
  return {
    userId: input.userId,
    creatorProfileId: input.creatorProfileId,
  };
}

function priorEvidence(sourceMemoryRecordIds: readonly string[]) {
  return sourceMemoryRecordIds.map(sourceRecordId => ({ sourceRecordId }));
}

function confidenceString(value: number): string {
  return value.toFixed(2);
}

/**
 * Concrete v0 adapter (no real OpenAI Agents SDK call yet to keep deps minimal;
 * reuses MemoryStore + identity resolver from lib/memory/).
 */
export class OpenAIAgentsAdapter implements AgentHarness {
  private readonly resolver: MemoryIdentityResolver;

  constructor(private readonly store: MemoryStore = defaultMemoryStore) {
    this.resolver = new MemoryIdentityResolver(store);
  }

  async runStudioSessionMemoryLoop(
    input: StudioSessionInput
  ): Promise<StudioSessionResult> {
    const scope = memoryScope(input);
    assertMemoryScope(scope);

    const {
      triggerContext,
      sourceMemoryRecordIds = [],
      nearbyContextRefs = [],
    } = input;

    logger.info('[agent-harness] studio-session memory loop start (v0)', {
      userId: input.userId,
      triggerKeys: Object.keys(triggerContext),
    });

    const now = new Date().toISOString();
    const evidence: StudioSessionResult['evidence'] = [];
    const lineageRefs = [
      ...sourceMemoryRecordIds,
      ...nearbyContextRefs,
      `photo_tag:${String(triggerContext.photoId ?? 'unknown')}`,
    ];

    try {
      const prior = priorEvidence(sourceMemoryRecordIds);

      // 1. Record trigger as memory source record (provenance root)
      const photoId = String(triggerContext.photoId ?? `unknown_${Date.now()}`);
      const triggerSource = await this.store.upsertSourceRecord(scope, {
        sourceType: 'profile_photo',
        externalId: `studio_session_trigger:${photoId}`,
        metadata: buildEvidenceMetadata(prior, {
          ...triggerContext,
          phase: 'studio_session_v0_trigger',
          sessionTs: now,
          sourceRefs: lineageRefs,
        }),
      });
      const triggerEvidence = [...prior, { sourceRecordId: triggerSource.id }];
      evidence.push({
        sourceRecordId: triggerSource.id,
        kind: 'studio_session_trigger',
        sourceRefs: lineageRefs,
        confidence: 0.95,
        data: triggerSource.metadata as Record<string, unknown>,
      });

      // 2. v0 "enrich person" — stub (real would call OpenAI Agents SDK tool)
      const personName =
        (triggerContext.personName as string) ||
        (triggerContext.taggedName as string) ||
        'Unknown Person';
      const personConfidence = 0.82;
      const personResolved = await this.resolver.resolve(scope, {
        type: 'person',
        name: personName,
        confidence: confidenceString(personConfidence),
        metadata: {
          phase: 'person_enrichment_v0',
          fromTrigger: triggerContext,
        },
        evidence: triggerEvidence,
      });
      const personObservation = await this.store.createObservation(scope, {
        entityId: personResolved.entityId,
        sourceRecordId: triggerSource.id,
        fact: `Tagged person identified as ${personName}`,
        confidence: confidenceString(personConfidence),
        metadata: buildEvidenceMetadata(triggerEvidence, {
          phase: 'person_enrichment_v0',
          sourceRefs: [...lineageRefs, 'enrich:stub'],
        }),
      });
      const personRef = {
        id: personResolved.entityId,
        name: personName,
        confidence: personConfidence,
      };
      evidence.push({
        observationId: personObservation.id,
        entityId: personResolved.entityId,
        sourceRecordId: triggerSource.id,
        kind: 'person_enrichment',
        sourceRefs: [...lineageRefs, 'enrich:stub'],
        confidence: personConfidence,
        data: personObservation.metadata as Record<string, unknown>,
      });

      // 3. Correlate nearby Gmail/Calendar refs as memory source records + observations
      for (const ref of nearbyContextRefs) {
        const sourceType = ref.startsWith('gmail:')
          ? 'gmail_message'
          : ref.startsWith('cal:')
            ? 'calendar_event'
            : 'manual';
        const correlatedSource = await this.store.upsertSourceRecord(scope, {
          sourceType,
          externalId: ref,
          metadata: buildEvidenceMetadata(triggerEvidence, {
            phase: 'context_correlation_v0',
            ref,
            studioSessionLink: true,
          }),
        });
        const correlationObservation = await this.store.createObservation(
          scope,
          {
            entityId: personResolved.entityId,
            sourceRecordId: correlatedSource.id,
            fact: `Nearby context correlated for studio session: ${ref}`,
            confidence: '0.70',
            metadata: buildEvidenceMetadata(
              [{ sourceRecordId: correlatedSource.id }],
              {
                phase: 'context_correlation_v0',
                refs: nearbyContextRefs,
                studioSessionLink: true,
              }
            ),
          }
        );
        evidence.push({
          observationId: correlationObservation.id,
          sourceRecordId: correlatedSource.id,
          entityId: personResolved.entityId,
          kind: 'context_correlation',
          sourceRefs: nearbyContextRefs,
          confidence: 0.7,
          data: correlationObservation.metadata as Record<string, unknown>,
        });
      }

      // 4. Create studio-session event + approval-gated opportunity
      const studioSessionEvent = await this.store.createEvent(scope, {
        sourceRecordId: triggerSource.id,
        title: `Studio session: ${personName}`,
        occurredAt: new Date(now),
        metadata: buildEvidenceMetadata(triggerEvidence, {
          phase: 'studio_session_v0',
          location: triggerContext.location ?? null,
          songRef: triggerContext.songRef ?? null,
        }),
      });
      await this.store.createEventParticipant(scope, {
        eventId: studioSessionEvent.id,
        entityId: personResolved.entityId,
        role: 'participant',
        metadata: buildEvidenceMetadata(triggerEvidence),
      });

      const studioSessionId = studioSessionEvent.id;
      const opportunity = await this.store.createOpportunity(scope, {
        entityId: personResolved.entityId,
        title: `Create content from studio session with ${personName}`,
        description:
          'gh-9869 v0 loop — opportunity proposed from memory graph evidence',
        metadata: buildEvidenceMetadata(triggerEvidence, {
          studioSessionId,
          personRef,
          suggestedActionKind: 'create_content_from_studio_session',
          approvalGated: true,
          provenanceNote:
            'gh-9869 v0 loop — all facts have sourceRefs + confidence + userId',
        }),
      });

      evidence.push({
        sourceRecordId: triggerSource.id,
        entityId: personResolved.entityId,
        kind: 'content_opportunity',
        sourceRefs: evidence.flatMap(item => item.sourceRefs),
        confidence: 0.75,
        data: opportunity.metadata as Record<string, unknown>,
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
          sources: [...sourceMemoryRecordIds, ...nearbyContextRefs],
          flag: 'MEMORY_STUDIO_SESSION_V0',
        },
      };

      logger.info('[agent-harness] studio-session memory loop complete (v0)', {
        userId: input.userId,
        studioSessionId,
        evidenceCount: evidence.length,
        opportunityId: opportunity.id,
      });

      return result;
    } catch (err) {
      captureError('agent-harness studio-session v0 failed', err, {
        userId: input.userId,
        triggerContext,
      });
      throw err;
    }
  }
}

// Default export for convenience in runner
export const defaultAgentHarness: AgentHarness = new OpenAIAgentsAdapter();
