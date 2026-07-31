/**
 * POST /api/onboarding/presence-build
 *
 * Advances one onboarding presence-build step for the authenticated user
 * (JOV-3988). Client polls this while the first-session chat is open so
 * tool artifacts appear live without waiting for the 6-minute workflow cron.
 *
 * Kill-switch: APP flag ONBOARDING_WOW_TASK_QUEUE.
 * Failure mode: returns { disabled: true } / { done: true } without error —
 * chat remains usable.
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

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST() {
  try {
    const { user, profile } = await getSessionContext({
      requireProfile: false,
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const enabled = await getAppFlagValue('ONBOARDING_WOW_TASK_QUEUE', {
      userId: user.clerkId ?? user.id,
    });

    if (!enabled) {
      return NextResponse.json(
        { ok: true, disabled: true, done: true, advanced: false },
        { status: 200, headers: NO_STORE_HEADERS }
      );
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
      return NextResponse.json(
        { ok: true, done: true, advanced: false, missing: true },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (run.status === 'completed' || run.status === 'failed') {
      return NextResponse.json(
        {
          ok: true,
          done: true,
          advanced: false,
          workflowRunId: run.id,
          status: run.status,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const result = await advanceOnboardingPresenceBuild({
      workflowRunId: run.id,
    });

    if (!result) {
      return NextResponse.json(
        {
          ok: true,
          done: true,
          advanced: false,
          workflowRunId: run.id,
          degraded: true,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        done: result.done,
        advanced: result.advanced,
        workflowRunId: result.workflowRunId,
        lastStepId: result.lastStepId,
        toolEvents: result.toolEvents,
        steps: result.steps,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const sessionErrorResponse = getSessionErrorResponse(
      error,
      NO_STORE_HEADERS
    );
    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    await captureError('Onboarding presence-build tick failed', error, {
      route: '/api/onboarding/presence-build',
    });

    // Degrade closed to non-error so the chat shell never hard-fails.
    return NextResponse.json(
      { ok: true, done: true, advanced: false, degraded: true },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }
}
