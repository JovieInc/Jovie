import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { db } from '@/lib/db';
import { chatMessages } from '@/lib/db/schema/chat';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
  PRESENCE_BUILD_STEPS,
} from './constants';
import {
  buildInitialPresenceToolEvents,
  initialStepStates,
} from './tool-events';
import type { PresenceBuildStepOutputs } from './types';

export interface SeedPresenceBuildInput {
  readonly userId: string;
  readonly profileId: string;
  readonly conversationId: string;
  readonly messageId: string;
}

export interface SeedPresenceBuildResult {
  readonly workflowRunId: string;
  readonly toolEvents: PersistedToolEvent[];
  readonly reused: boolean;
}

/**
 * Idempotently seed an onboarding presence-build workflow run and attach
 * initial running tool events to the welcome assistant message.
 *
 * Failures are soft — callers must degrade to current onboarding.
 */
export async function seedOnboardingPresenceBuild(
  input: SeedPresenceBuildInput
): Promise<SeedPresenceBuildResult | null> {
  try {
    const existing = await db
      .select({
        id: workflowRuns.id,
        stepOutputs: workflowRuns.stepOutputs,
        status: workflowRuns.status,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.userId, input.userId),
          eq(workflowRuns.kind, ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND)
        )
      )
      .limit(1);

    if (existing[0]) {
      const outputs = existing[0].stepOutputs as
        | PresenceBuildStepOutputs
        | Record<string, unknown>
        | null;
      const toolEvents =
        outputs &&
        typeof outputs === 'object' &&
        Array.isArray((outputs as PresenceBuildStepOutputs).toolEvents)
          ? (outputs as PresenceBuildStepOutputs).toolEvents
          : buildInitialPresenceToolEvents();

      return {
        workflowRunId: existing[0].id,
        toolEvents,
        reused: true,
      };
    }

    const toolEvents = buildInitialPresenceToolEvents();
    const stepOutputs: PresenceBuildStepOutputs = {
      kind: ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
      schemaVersion: 1,
      profileId: input.profileId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      userId: input.userId,
      steps: initialStepStates(),
      toolEvents,
    };

    const [run] = await db
      .insert(workflowRuns)
      .values({
        kind: ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
        userId: input.userId,
        status: 'queued',
        currentStep: PRESENCE_BUILD_STEPS[0],
        stepOutputs,
        runAt: new Date(),
      })
      .returning({ id: workflowRuns.id });

    if (!run) {
      return null;
    }

    await db
      .update(chatMessages)
      .set({ toolCalls: toolEvents })
      .where(eq(chatMessages.id, input.messageId));

    logger.info('[presence-build] seeded workflow run', {
      workflowRunId: run.id,
      profileId: input.profileId,
      conversationId: input.conversationId,
    });

    return {
      workflowRunId: run.id,
      toolEvents,
      reused: false,
    };
  } catch (error) {
    await captureError('Failed to seed onboarding presence build', error, {
      route: 'onboarding/presence-build',
      profileId: input.profileId,
      conversationId: input.conversationId,
    });
    return null;
  }
}
