/**
 * POST /api/onboarding/presence-build — advance one presence-build step (JOV-3988).
 * Kill-switch: ONBOARDING_WOW_TASK_QUEUE. Soft-degrades so chat never hard-fails.
 */

import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getSessionErrorResponse } from '@/app/api/chat/session-error-response';
import { getSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import {
  advanceOnboardingPresenceBuild,
  ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND,
} from '@/lib/onboarding/presence-build';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function ok(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST() {
  try {
    const { user, profile } = await getSessionContext({
      requireProfile: false,
    });
    if (!profile) {
      return ok({ error: 'Profile not found' }, 404);
    }

    const enabled = await getAppFlagValue('ONBOARDING_WOW_TASK_QUEUE', {
      userId: user.clerkId ?? user.id,
    });
    if (!enabled) {
      return ok({ ok: true, disabled: true, done: true, advanced: false });
    }

    const [run] = await db
      .select({ id: workflowRuns.id, status: workflowRuns.status })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.userId, user.id),
          eq(workflowRuns.kind, ONBOARDING_PRESENCE_BUILD_WORKFLOW_KIND)
        )
      )
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    if (!run) {
      return ok({ ok: true, done: true, advanced: false, missing: true });
    }
    if (run.status === 'completed' || run.status === 'failed') {
      return ok({
        ok: true,
        done: true,
        advanced: false,
        workflowRunId: run.id,
        status: run.status,
      });
    }

    const result = await advanceOnboardingPresenceBuild({
      workflowRunId: run.id,
    });
    if (!result) {
      return ok({
        ok: true,
        done: true,
        advanced: false,
        workflowRunId: run.id,
        degraded: true,
      });
    }

    return ok({
      ok: true,
      done: result.done,
      advanced: result.advanced,
      workflowRunId: result.workflowRunId,
      lastStepId: result.lastStepId,
      toolEvents: result.toolEvents,
      steps: result.steps,
    });
  } catch (error) {
    const sessionErrorResponse = getSessionErrorResponse(error, NO_STORE);
    if (sessionErrorResponse) return sessionErrorResponse;

    await captureError('Onboarding presence-build tick failed', error, {
      route: '/api/onboarding/presence-build',
    });
    return ok({ ok: true, done: true, advanced: false, degraded: true });
  }
}
