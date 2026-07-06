import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyVisualQaReviewToRunArtifactFile,
  reviewVisualQaSurface,
  VISUAL_QA_FOLLOW_UP_ACTIONS,
  VISUAL_QA_REVIEW_DECISIONS,
  type VisualQaFollowUpAction,
  VisualQaReviewError,
} from '@/lib/agent-os/visual-qa/review';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  dispatchHermesWorker,
  getHermesDispatchAvailability,
} from '@/lib/hermes/dispatch';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const RunParamsSchema = z.object({
  runId: z.string().trim().min(1).max(80),
});

const ReviewRequestSchema = z.object({
  surfaceId: z.string().trim().min(1).max(80),
  decision: z.enum(VISUAL_QA_REVIEW_DECISIONS),
  notes: z.string().trim().max(2000).optional(),
  followUpAction: z.enum(VISUAL_QA_FOLLOW_UP_ACTIONS).optional(),
});

const FOLLOW_UP_SKILLS: Record<VisualQaFollowUpAction, readonly string[]> = {
  d2_review: ['autoplan'],
  design_html_builder: ['design-html', 'autoplan'],
};

async function triggerFollowUpDispatch(params: {
  readonly runId: string;
  readonly surfaceId: string;
  readonly followUpAction: VisualQaFollowUpAction;
  readonly notes: string | null;
  readonly requestedBy: string;
}): Promise<string | null> {
  const availability = getHermesDispatchAvailability();
  if (!availability.available) {
    logger.info(
      '[api/admin/hud/visual-qa] Hermes unavailable; skipping follow-up dispatch',
      {
        runId: params.runId,
        surfaceId: params.surfaceId,
        reason: availability.unavailableReason,
      }
    );
    return null;
  }

  const flowLabel =
    params.followUpAction === 'design_html_builder'
      ? 'design-html builder'
      : 'D2 design review flow';

  const result = await dispatchHermesWorker({
    source: 'ci',
    sourceId: `visual-qa:${params.runId}:${params.surfaceId}`,
    kind: 'qa',
    runtime: 'claude-code',
    skills: [...FOLLOW_UP_SKILLS[params.followUpAction]],
    prompt: [
      `Visual QA rejection follow-up (${flowLabel}).`,
      `Run: ${params.runId}`,
      `Surface: ${params.surfaceId}`,
      `An admin rejected the post-deploy visual drift on this surface. Investigate the diff overlay under agentos/runs/visual-qa/${params.runId}/ and prepare the appropriate fix.`,
      params.notes ? `Reviewer notes:\n${params.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  return result.dispatchId;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
): Promise<Response> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const params = RunParamsSchema.parse(await context.params);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = ReviewRequestSchema.parse(body);
    const reviewer =
      entitlements.email ?? entitlements.userId ?? 'admin@jovie.local';
    const notes = parsedBody.notes?.trim() ? parsedBody.notes.trim() : null;
    const followUpAction =
      parsedBody.decision === 'rejected'
        ? (parsedBody.followUpAction ?? 'd2_review')
        : null;

    let dispatchId: string | null = null;
    if (parsedBody.decision === 'rejected' && followUpAction) {
      try {
        dispatchId = await triggerFollowUpDispatch({
          runId: params.runId,
          surfaceId: parsedBody.surfaceId,
          followUpAction,
          notes,
          requestedBy: reviewer,
        });
      } catch (dispatchError) {
        // Persist the review even when follow-up routing fails; surface it in logs.
        logger.error(
          '[api/admin/hud/visual-qa] Follow-up dispatch failed',
          dispatchError
        );
        await captureError('Visual QA follow-up dispatch failed', dispatchError, {
          route: '/api/admin/hud/visual-qa/[runId]/review',
          runId: params.runId,
          surfaceId: parsedBody.surfaceId,
        });
      }
    }

    const review = await reviewVisualQaSurface({
      runId: params.runId,
      surfaceId: parsedBody.surfaceId,
      decision: parsedBody.decision,
      notes,
      reviewer,
      followUpAction,
      dispatchId,
    });

    // Reflect the decision onto the run's persisted AgentRunArtifact when
    // the capture harness wrote one (resolves its human gate once all
    // drifted surfaces are reviewed). The review itself is already durable.
    let artifactUpdated = false;
    try {
      artifactUpdated = await applyVisualQaReviewToRunArtifactFile(
        params.runId
      );
    } catch (artifactError) {
      logger.error(
        '[api/admin/hud/visual-qa] Failed to update run artifact',
        artifactError
      );
      await captureError('Visual QA artifact update failed', artifactError, {
        route: '/api/admin/hud/visual-qa/[runId]/review',
        runId: params.runId,
      });
    }

    return NextResponse.json(
      { ok: true, review, artifactUpdated },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid Visual QA review request', issues: error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (error instanceof VisualQaReviewError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.code === 'not_found' ? 404 : 409,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    logger.error('[api/admin/hud/visual-qa/[runId]/review] Review failed', error);
    await captureError('Visual QA review failed', error, {
      route: '/api/admin/hud/visual-qa/[runId]/review',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to review Visual QA surface' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
