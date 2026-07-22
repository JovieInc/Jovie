/**
 * POST /api/connectors/suggested-actions/[id]/approve
 *
 * CAS-only approve endpoint.
 * Atomically transitions suggested_actions row: pending → approved.
 * On success, inserts a workflow_runs row to execute the approved action.
 *
 * Design: The CAS update and workflow_runs insert are two sequential writes.
 * db.transaction() is forbidden per .claude/rules/db.md; transactional atomicity
 * is handled at the application layer. On a CAS miss,
 * recoverOrphanedApprovedAction returns 200 when it enqueues or finds an existing
 * workflow run, 404 when the action is not found, and 409 for other decided rows.
 * The frequent reconciliation job also enqueues approved rows that have no run.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import {
  buildAuthorityPageDraft,
  type ClaimedGraphContext,
  isAuthorityPagePlatform,
} from '@/lib/authority';
import { recordInboxDecision } from '@/lib/connectors/inbox-decision';
import { AUTHORITY_CREATE_PAGE_KIND } from '@/lib/connectors/playbooks/authority-page-gap-detector';
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

type AuthorityCreatePagePayload = {
  platform?: unknown;
  artistName?: unknown;
  graphContext?: ClaimedGraphContext;
  humanGateRequired?: unknown;
};

function isCalendarActionKind(kind: string | null | undefined): boolean {
  if (typeof kind !== 'string' || kind.length === 0) return false;
  return kind === 'calendar.create_event' || kind.startsWith('calendar.');
}

/**
 * Authority create-page approvals draft (never publish). Wikipedia stays
 * human-gated; Fandom/Genius drafts are agent-assisted copy for the artist.
 */
async function completeAuthorityCreatePageApproval(input: {
  readonly approvalId: string;
  readonly userId: string;
  readonly payload: unknown;
}): Promise<{
  readonly draft: ReturnType<typeof buildAuthorityPageDraft>;
  readonly humanGateRequired: boolean;
}> {
  const raw = (input.payload ?? {}) as AuthorityCreatePagePayload;
  const platform = isAuthorityPagePlatform(raw.platform)
    ? raw.platform
    : 'fandom';
  const artistName =
    typeof raw.artistName === 'string' && raw.artistName.trim().length > 0
      ? raw.artistName.trim()
      : typeof raw.graphContext?.artistName === 'string'
        ? raw.graphContext.artistName.trim()
        : 'Artist';

  const graphContext: ClaimedGraphContext = {
    ...(raw.graphContext ?? {}),
    artistName,
  };

  const draft = buildAuthorityPageDraft(platform, graphContext);

  await db
    .update(suggestedActions)
    .set({
      status: 'executed',
      executedAt: new Date(),
      executionResult: {
        kind: AUTHORITY_CREATE_PAGE_KIND,
        draft,
        published: false,
        humanGateRequired: draft.humanGateRequired,
        createUrl: draft.createUrl,
      },
    })
    .where(
      and(
        eq(suggestedActions.id, input.approvalId),
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.status, 'approved')
      )
    );

  return { draft, humanGateRequired: draft.humanGateRequired };
}

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
      });

    if (updated.length === 0) {
      const recovery = await recoverOrphanedApprovedAction({
        approvalId: id,
        userId,
      });

      if (recovery === 'enqueued' || recovery === 'already-queued') {
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

    const kind = updated[0].kind;
    const eventPayload = updated[0].payload as BookingPayload | null;

    // Authority page drafts: generate stub + mark executed (never auto-publish).
    if (kind === AUTHORITY_CREATE_PAGE_KIND) {
      const { draft, humanGateRequired } =
        await completeAuthorityCreatePageApproval({
          approvalId: id,
          userId,
          payload: updated[0].payload,
        });

      logger.info('[approve] authority.create_page drafted', {
        approvalId: id,
        userId,
        platform: draft.platform,
        humanGateRequired,
      });

      void recordInboxDecision({
        suggestedActionId: id,
        userId,
        verdict: 'approved',
        cardKind: kind,
        surface: 'opportunity-inbox',
      });

      return NextResponse.json(
        {
          ok: true,
          approvalId: id,
          kind,
          draft,
          published: false,
          humanGateRequired,
          createUrl: draft.createUrl,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Calendar (and future executor-backed) kinds enqueue workflow_runs.
    // Non-calendar kinds must not be pushed into the calendar executor.
    let enqueueResult: 'enqueued' | 'already-queued' | 'skipped' = 'skipped';
    if (isCalendarActionKind(kind)) {
      enqueueResult = await enqueueApprovedActionWorkflow({
        userId,
        approvalId: id,
        eventPayload,
      });
    }

    logger.info('[approve] suggested_action approved', {
      approvalId: id,
      userId,
      kind,
      enqueueResult,
    });

    // Taste writeback (JOV-3934) — non-blocking. userId is already users.id.
    void recordInboxDecision({
      suggestedActionId: id,
      userId,
      verdict: 'approved',
      cardKind: kind,
      surface: 'opportunity-inbox',
    });

    return NextResponse.json(
      { ok: true, approvalId: id, kind, enqueueResult },
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
