/**
 * POST /api/connectors/suggested-actions/[id]/approve
 *
 * CAS-only approve endpoint.
 * Atomically transitions suggested_actions row: pending → accepted.
 * On success, inserts a workflow_runs row to execute the approved action.
 *
 * Returns 409 if the row was already decided (CAS missed).
 *
 * Design: No writes beyond the approved_actions CAS transition and the
 * workflow_runs insert. All calendar work happens in the workflow executor.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { suggestedActions, workflowRuns } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    // CAS transition: pending → accepted (WHERE status='pending' AND userId=:userId)
    const updated = await db
      .update(suggestedActions)
      .set({ status: 'accepted', approvedAt: new Date() })
      .where(
        and(
          eq(suggestedActions.id, id),
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning({ id: suggestedActions.id });

    if (updated.length === 0) {
      // 0 rows returned = CAS missed (already decided or not found)
      return NextResponse.json(
        { error: 'already-decided' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Insert workflow_runs to execute the approved action
    await db.insert(workflowRuns).values({
      kind: 'execute_approved_action',
      userId,
      status: 'pending',
      currentStep: 'create_calendar_event',
      stepOutputs: { approvalId: id },
      runAt: new Date(),
    });

    logger.info('[approve] suggested_action approved, workflow_run queued', {
      approvalId: id,
      userId,
    });

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
