/**
 * POST /api/connectors/suggested-actions/[id]/reject
 *
 * CAS-only reject endpoint.
 * Atomically transitions suggested_actions row: pending → dismissed.
 *
 * Returns 409 if the row was already decided (CAS missed).
 * Does NOT insert a workflow_runs row — rejection requires no follow-up work.
 */

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { recordInboxDecision } from '@/lib/connectors/inbox-decision';
import { YOUTUBE_THUMBNAIL_CANDIDATE_KIND } from '@/lib/connectors/suggested-action-kinds';
import { parseYouTubeThumbnailCandidate } from '@/lib/connectors/youtube-thumbnail-candidate';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  reconcileThumbnailCandidateDecision,
  YouTubeThumbnailDecisionError,
} from '@/lib/youtube-library';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  // Optional reject reason — never blocks the gesture (JOV-3934).
  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === 'string' && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 200);
    }
  } catch {
    // Empty body is fine — reject still proceeds.
  }

  try {
    const [candidate] = await db
      .select({
        kind: suggestedActions.kind,
        payload: suggestedActions.payload,
        status: suggestedActions.status,
      })
      .from(suggestedActions)
      .where(
        and(eq(suggestedActions.id, id), eq(suggestedActions.userId, userId))
      )
      .limit(1);
    if (!candidate) {
      return NextResponse.json(
        { error: 'not-found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const isYoutubeCandidate =
      candidate.kind === YOUTUBE_THUMBNAIL_CANDIDATE_KIND;
    if (
      isYoutubeCandidate &&
      !parseYouTubeThumbnailCandidate(candidate.kind, candidate.payload)
    ) {
      return NextResponse.json(
        { error: 'invalid-youtube-thumbnail-candidate' },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }
    if (candidate.status === 'rejected' && isYoutubeCandidate) {
      await reconcileThumbnailCandidateDecision({
        suggestedActionId: id,
        userId,
        payload: candidate.payload,
        decision: 'rejected',
      });
      return NextResponse.json(
        { ok: true, approvalId: id, status: 'rejected' },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // CAS transition: pending → rejected (WHERE status='pending' AND userId=:userId)
    const updated = await db
      .update(suggestedActions)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(suggestedActions.id, id),
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning({ id: suggestedActions.id, kind: suggestedActions.kind });

    if (updated.length === 0) {
      const [existing] = await db
        .select({ status: suggestedActions.status })
        .from(suggestedActions)
        .where(
          and(eq(suggestedActions.id, id), eq(suggestedActions.userId, userId))
        )
        .limit(1);
      if (existing?.status === 'rejected') {
        return NextResponse.json(
          { ok: true, approvalId: id, status: 'already-rejected' },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { error: existing ? 'already-decided' : 'not-found' },
        { status: existing ? 409 : 404, headers: NO_STORE_HEADERS }
      );
    }

    if (isYoutubeCandidate) {
      await reconcileThumbnailCandidateDecision({
        suggestedActionId: id,
        userId,
        payload: candidate.payload,
        decision: 'rejected',
      });
    }

    logger.info('[reject] suggested_action dismissed', {
      approvalId: id,
      userId,
    });

    // Taste writeback (JOV-3934) — non-blocking. userId is already users.id.
    void recordInboxDecision({
      suggestedActionId: id,
      userId,
      verdict: 'rejected',
      reason,
      cardKind: updated[0]?.kind ?? null,
      surface: 'opportunity-inbox',
    });
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

    return NextResponse.json(
      { ok: true, approvalId: id },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    if (err instanceof YouTubeThumbnailDecisionError) {
      return NextResponse.json(
        { error: err.code },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }
    logger.error('[reject] Failed to dismiss suggested_action', err);
    await captureError('suggest-action reject failed', err, {
      route: '/api/connectors/suggested-actions/[id]/reject',
      approvalId: id,
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
