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
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
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
    // CAS transition: pending → dismissed (WHERE status='pending' AND userId=:userId)
    const updated = await db
      .update(suggestedActions)
      .set({ status: 'dismissed' })
      .where(
        and(
          eq(suggestedActions.id, id),
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning({ id: suggestedActions.id });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'already-decided' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    logger.info('[reject] suggested_action dismissed', {
      approvalId: id,
      userId,
    });

    return NextResponse.json(
      { ok: true, approvalId: id },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
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
