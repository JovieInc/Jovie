/**
 * POST /api/connectors/suggested-actions/[id]/approve
 *
 * CAS-only approve endpoint.
 * Atomically transitions suggested_actions row: pending → approved.
 * On success, executable connector actions insert a workflow_runs row.
 * Brand-deal buyer approvals are decision-only: they authorize internal
 * campaign preparation and never enter the calendar executor.
 *
 * Design: The CAS update and workflow_runs insert are two sequential writes.
 * db.transaction() is forbidden per .claude/rules/db.md; transactional atomicity
 * is handled at the application layer. On a CAS miss,
 * recoverOrphanedApprovedAction returns 200 when it enqueues or finds an existing
 * workflow run, 404 when the action is not found, and 409 for other decided rows.
 * The frequent reconciliation job also enqueues approved rows that have no run.
 */

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { CACHE_TAGS } from '@/lib/cache/tags';
import {
  BRAND_DEAL_OPPORTUNITY_KIND,
  parseBrandDealOpportunity,
} from '@/lib/connectors/brand-deal-opportunity';
import { recordInboxDecision } from '@/lib/connectors/inbox-decision';
import { SOCIAL_REPLY_ACTION_KIND } from '@/lib/connectors/social-replies/stage-actions';
import {
  enqueueApprovedActionWorkflow,
  recoverOrphanedApprovedAction,
} from '@/lib/connectors/workflows/reconcile-orphaned-approved-actions';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// payload shape stored in suggestedActions for calendar booking actions
type BookingPayload = {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  timeZone?: string;
};

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    // CAS transition: pending → approved (WHERE status='pending' AND userId=:userId)
    // Also return payload so we can include eventPayload in the workflow_runs row.
    const updated = await db
      .update(suggestedActions)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(
        and(
          eq(suggestedActions.id, id),
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning({
        id: suggestedActions.id,
        payload: suggestedActions.payload,
        kind: suggestedActions.kind,
        signalType: suggestedActions.signalType,
      });

    if (updated.length === 0) {
      const recovery = await recoverOrphanedApprovedAction({
        approvalId: id,
        userId,
      });

      if (recovery === 'decision-only') {
        revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
        return NextResponse.json(
          {
            ok: true,
            approvalId: id,
            status: 'approved-for-preparation',
          },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      if (recovery === 'invalid-decision-only') {
        await db
          .update(suggestedActions)
          .set({ status: 'failed' })
          .where(
            and(
              eq(suggestedActions.id, id),
              eq(suggestedActions.userId, userId),
              eq(suggestedActions.status, 'approved')
            )
          );
        revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
        return NextResponse.json(
          { error: 'brand-deal-evidence-unverified' },
          { status: 422, headers: NO_STORE_HEADERS }
        );
      }

      if (recovery === 'enqueued' || recovery === 'already-queued') {
        revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
        return NextResponse.json(
          {
            ok: true,
            approvalId: id,
            status:
              recovery === 'enqueued'
                ? 'approved-recovered'
                : 'approved-pending-enqueue',
          },
          { status: 200, headers: NO_STORE_HEADERS }
        );
      }

      if (recovery === 'not-found') {
        return NextResponse.json(
          { error: 'not-found' },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      // 0 rows returned = CAS missed (already decided or not found)
      return NextResponse.json(
        { error: 'already-decided' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Include event payload so the cron executor can call Google Calendar
    // without a second DB round-trip to reload the suggested_action row.
    const eventPayload = updated[0].payload as BookingPayload | null;
    const approvedKind = updated[0].kind;
    const isBrandDealDecision =
      approvedKind === BRAND_DEAL_OPPORTUNITY_KIND ||
      updated[0].signalType === 'brand_deal';

    if (isBrandDealDecision) {
      if (!parseBrandDealOpportunity(approvedKind, updated[0].payload)) {
        await db
          .update(suggestedActions)
          .set({ status: 'failed' })
          .where(
            and(
              eq(suggestedActions.id, id),
              eq(suggestedActions.userId, userId),
              eq(suggestedActions.status, 'approved')
            )
          );
        logger.warn('[approve] invalid brand-deal provenance failed closed', {
          approvalId: id,
          userId,
        });
        revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');
        return NextResponse.json(
          { error: 'brand-deal-evidence-unverified' },
          { status: 422, headers: NO_STORE_HEADERS }
        );
      }

      logger.info(
        '[approve] brand-deal buyer approved for internal preparation',
        {
          approvalId: id,
          userId,
        }
      );
      void recordInboxDecision({
        suggestedActionId: id,
        userId,
        verdict: 'approved',
        cardKind: approvedKind,
        surface: 'opportunity-inbox',
      });
      revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

      return NextResponse.json(
        {
          ok: true,
          approvalId: id,
          status: 'approved-for-preparation',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (approvedKind === SOCIAL_REPLY_ACTION_KIND) {
      void recordInboxDecision({
        suggestedActionId: id,
        userId,
        verdict: 'approved',
        cardKind: approvedKind,
        surface: 'opportunity-inbox',
      });
      revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

      return NextResponse.json(
        {
          ok: true,
          approvalId: id,
          status: 'approved-awaiting-connector-execution',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    const enqueueResult = await enqueueApprovedActionWorkflow({
      userId,
      approvalId: id,
      eventPayload,
    });

    logger.info('[approve] suggested_action approved, workflow_run queued', {
      approvalId: id,
      userId,
      enqueueResult,
    });

    // Taste writeback (JOV-3934) — non-blocking. userId is already users.id.
    void recordInboxDecision({
      suggestedActionId: id,
      userId,
      verdict: 'approved',
      cardKind: updated[0]?.kind ?? null,
      surface: 'opportunity-inbox',
    });
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

    return NextResponse.json(
      { ok: true, approvalId: id },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[approve] Failed to approve suggested_action', err);
    await captureError('suggest-action approve failed', err, {
      route: '/api/connectors/suggested-actions/[id]/approve',
      approvalId: id,
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
