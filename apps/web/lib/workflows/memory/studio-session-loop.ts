/**
 * Studio Session Memory Loop (gh-9869 v0)
 *
 * Thin runner / workflow executor.
 * - Gate: FEATURE_MEMORY_STUDIO_SESSION_V0 (default false)
 * - Uses AgentHarness for enrichment + opportunity proposal
 * - Full evidence/provenance on every fact (context_facts + synthetic refs)
 * - Reuses patterns from lib/connectors/workflows/execute-approved-action.ts (CAS, logging, captureError)
 * - No social/write scopes ever enabled in v0.
 *
 * Triggered from: demo script, future Trigger.dev job (trigger/ dir), or cron on photo tags.
 * When 9872 lands: replace synthetic ids with real person_entities / studio_sessions / content_opportunities inserts.
 */

import {
  defaultAgentHarness,
  type StudioSessionInput,
  type StudioSessionResult,
} from '@/lib/agents/agent-harness';
import { captureError } from '@/lib/error-tracking';
import { isEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/utils/logger';

export interface RunStudioSessionMemoryLoopInput extends StudioSessionInput {
  /** Force even if flag off (only for tests/demo seeds) */
  force?: boolean;
}

export interface RunStudioSessionMemoryLoopResult extends StudioSessionResult {
  gated: boolean;
  flag: string;
}

/**
 * Main entry for the v0 studio-session memory loop.
 * Callers (demo, future workflow) must pass user-scoped input.
 */
export async function runStudioSessionMemoryLoop(
  input: RunStudioSessionMemoryLoopInput
): Promise<RunStudioSessionMemoryLoopResult> {
  const flagName = 'MEMORY_STUDIO_SESSION_V0' as const;
  const gated = !isEnabled(flagName) && !input.force;

  if (gated) {
    logger.warn('[memory-loop] studio-session v0 gated off (default)', {
      userId: input.userId,
      flag: flagName,
    });
    // Still return a no-op result for callers that want to be defensive
    return {
      studioSessionId: 'gated_' + Date.now(),
      evidence: [],
      provenance: {
        triggeredAt: new Date().toISOString(),
        sources: input.sourceContextFactIds || [],
        flag: flagName,
      },
      gated: true,
      flag: flagName,
    };
  }

  logger.info('[memory-loop] studio-session v0 executing (flag on)', {
    userId: input.userId,
    force: !!input.force,
  });

  try {
    const harnessResult =
      await defaultAgentHarness.runStudioSessionMemoryLoop(input);

    const result: RunStudioSessionMemoryLoopResult = {
      ...harnessResult,
      gated: false,
      flag: flagName,
    };

    // In future: enqueue a workflowRuns row of kind 'studio_session_memory_v0' for durable follow-up (Trigger.dev or cron)
    // For v0 the harness already wrote the evidence facts + opportunity proposal.

    return result;
  } catch (err) {
    captureError('studio-session-memory-loop failed', err, {
      userId: input.userId,
      flag: flagName,
    });
    throw err;
  }
}

export const STUDIO_SESSION_MEMORY_FLAG = 'MEMORY_STUDIO_SESSION_V0';
