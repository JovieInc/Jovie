/**
 * AgentHarness (gh-9869 v0 studio-session memory)
 *
 * Interface + OpenAI Agents SDK adapter stub for the memory loop.
 * v0: thin, explicit, provenance-first. No social/write scopes.
 * Future: swap in real @openai/agents or Vercel AI SDK agent.
 *
 * Called only when FEATURE_MEMORY_STUDIO_SESSION_V0 enabled (caller gate).
 * Every output carries evidence links + confidence + user scoping.
 */

import { db } from '@/lib/db';
import type { NewContextFact } from '@/lib/db/schema/connectors';
import { contextFacts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export interface StudioSessionInput {
  userId: string;
  /** e.g. photo tag context or external trigger payload */
  triggerContext: Record<string, unknown>;
  /** Prior context_facts ids for lineage */
  sourceContextFactIds?: string[];
  /** Optional correlation hints (gmail thread ids, calendar event ids) */
  nearbyContextRefs?: string[];
}

export interface StudioSessionResult {
  studioSessionId: string; // synthetic for v0; real table in 9872
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

/**
 * Concrete v0 adapter (no real OpenAI Agents SDK call yet to keep deps minimal;
 * reuses existing patterns from lib/agents/registry + connectors).
 * When 9872 schema lands, this will insert into person_entities / studio_sessions / content_opportunities.
 */
export class OpenAIAgentsAdapter implements AgentHarness {
  async runStudioSessionMemoryLoop(
    input: StudioSessionInput
  ): Promise<StudioSessionResult> {
    const {
      userId,
      triggerContext,
      sourceContextFactIds = [],
      nearbyContextRefs = [],
    } = input;

    logger.info('[agent-harness] studio-session memory loop start (v0)', {
      userId,
      triggerKeys: Object.keys(triggerContext),
    });

    const now = new Date().toISOString();
    const evidence: StudioSessionResult['evidence'] = [];

    try {
      // 1. Record trigger as context_fact (provenance root)
      const triggerFact: NewContextFact = {
        userId,
        kind: 'other', // v0 uses 'other'; 9872 will add dedicated kinds e.g. 'studio_session_trigger'
        sourceObjectId: null,
        sourceRefs: [
          ...sourceContextFactIds,
          ...nearbyContextRefs,
          'photo_tag:' + (triggerContext.photoId || 'unknown'),
        ],
        data: {
          ...triggerContext,
          phase: 'studio_session_v0_trigger',
          sessionTs: now,
        },
        confidence: '0.95',
        expiresAt: null,
      };

      const [insertedTrigger] = await db
        .insert(contextFacts)
        .values(triggerFact)
        .returning({ id: contextFacts.id });
      evidence.push({
        factId: insertedTrigger.id,
        kind: 'studio_session_trigger',
        sourceRefs: triggerFact.sourceRefs as string[],
        confidence: 0.95,
        data: triggerFact.data as Record<string, unknown>,
      });

      // 2. v0 "enrich person" — stub (real would call OpenAI Agents SDK tool for NER + entity resolution against existing persons/artists)
      // For demo: synthesize a person ref from trigger context if present.
      const personName =
        (triggerContext.personName as string) ||
        (triggerContext.taggedName as string) ||
        'Unknown Person';
      const personRef = {
        id: 'person_v0_' + Math.random().toString(36).slice(2, 10),
        name: personName,
        confidence: 0.82,
      };

      // Record person enrichment as context_fact
      const personFact: NewContextFact = {
        userId,
        kind: 'other',
        sourceObjectId: null,
        sourceRefs: [...(triggerFact.sourceRefs as string[]), 'enrich:stub'],
        data: {
          phase: 'person_enrichment_v0',
          person: personRef,
          fromTrigger: triggerContext,
        },
        confidence: '0.82',
        expiresAt: null,
      };
      const [insertedPerson] = await db
        .insert(contextFacts)
        .values(personFact)
        .returning({ id: contextFacts.id });
      evidence.push({
        factId: insertedPerson.id,
        kind: 'person_enrichment',
        sourceRefs: personFact.sourceRefs as string[],
        confidence: 0.82,
        data: personFact.data as Record<string, unknown>,
      });

      // 3. Correlate nearby Gmail/Calendar (v0: record refs as facts; real uses existing google connectors + context_facts join)
      if (nearbyContextRefs.length > 0) {
        const corrFact: NewContextFact = {
          userId,
          kind: 'other',
          sourceObjectId: null,
          sourceRefs: nearbyContextRefs,
          data: {
            phase: 'context_correlation_v0',
            refs: nearbyContextRefs,
            studioSessionLink: true,
          },
          confidence: '0.70',
          expiresAt: null,
        };
        const [insertedCorr] = await db
          .insert(contextFacts)
          .values(corrFact)
          .returning({ id: contextFacts.id });
        evidence.push({
          factId: insertedCorr.id,
          kind: 'context_correlation',
          sourceRefs: nearbyContextRefs,
          confidence: 0.7,
          data: corrFact.data as Record<string, unknown>,
        });
      }

      // 4. Create synthetic studio-session + propose approval-gated opportunity
      const studioSessionId = 'studio_sess_v0_' + Date.now().toString(36);
      const opportunityId = 'opp_v0_' + Math.random().toString(36).slice(2, 10);

      // In real 9872: insert studio_sessions row + content_opportunities row (approval_status='pending')
      // v0: use context_fact + suggestedActions pattern (existing, approval gated)
      // For demo we just emit the opportunity ref; a follow-up executor (like execute-approved-action) would act.

      const opportunityEvidence = {
        factId: undefined,
        kind: 'content_opportunity',
        sourceRefs: evidence.flatMap(e => e.sourceRefs),
        confidence: 0.75,
        data: {
          studioSessionId,
          personRef,
          suggestedActionKind: 'create_content_from_studio_session',
          approvalGated: true,
          provenanceNote:
            'gh-9869 v0 loop — all facts have sourceRefs + confidence + userId',
        },
      };
      evidence.push(opportunityEvidence);

      const result: StudioSessionResult = {
        studioSessionId,
        personRef,
        evidence,
        opportunityRef: {
          id: opportunityId,
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
        opportunityId,
      });

      return result;
    } catch (err) {
      captureError('agent-harness studio-session v0 failed', err, {
        userId,
        triggerContext,
      });
      throw err;
    }
  }
}

// Default export for convenience in runner
export const defaultAgentHarness: AgentHarness = new OpenAIAgentsAdapter();
