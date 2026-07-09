/**
 * POST /api/connectors/suggested-actions/[id]/next-step
 *
 * Accepts the next-step CTA on a report-back card (GH #13178).
 *
 * Atomically transitions the parent report row pending → approved (same CAS
 * discipline as the approve endpoint), then inserts a NEW pending
 * suggested_action built from the report payload's `nextStep` descriptor,
 * linked to the parent experiment via sourceRefs.
 *
 * Idempotency: the child row's idempotencyKey is derived deterministically
 * from the parent id (`<parentId>:next-step`). A pre-insert lookup makes the
 * insert at-most-once at the application layer, so a retry after a CAS miss
 * (409) cannot double-create the follow-up action.
 *
 * Design: the CAS update and the child insert are two sequential writes —
 * db.transaction() is forbidden per .claude/rules/db.md. If the CAS succeeds
 * but the insert fails, the endpoint returns 500; on retry the CAS misses
 * (parent already approved) and the handler falls through to the idempotent
 * child lookup/insert, recovering the lost write.
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { parseReportMeasurement } from '@/lib/connectors/opportunity-inbox-report';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

async function insertNextStepAction(input: {
  readonly userId: string;
  readonly parentId: string;
  readonly parentPayload: unknown;
}): Promise<{ readonly childId: string } | { readonly error: string }> {
  const report = parseReportMeasurement(input.parentPayload);
  const nextStep = report?.nextStep ?? null;
  if (!nextStep) {
    return { error: 'no-next-step' };
  }

  const idempotencyKey = `${input.parentId}:next-step`;

  // At-most-once at the app layer: a retry after a partial failure finds the
  // already-inserted child instead of creating a duplicate.
  const existing = await db
    .select({ id: suggestedActions.id })
    .from(suggestedActions)
    .where(
      and(
        eq(suggestedActions.userId, input.userId),
        eq(suggestedActions.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { childId: existing[0].id };
  }

  const inserted = await db
    .insert(suggestedActions)
    .values({
      userId: input.userId,
      kind: nextStep.kind,
      payload: {
        ...(nextStep.payload ?? {}),
        title: nextStep.label,
        ...(nextStep.rationale ? { rationale: nextStep.rationale } : {}),
        parentExperimentId: report?.experimentId ?? null,
      },
      status: 'pending',
      sourceRefs: [
        {
          kind: 'experiment_report',
          suggestedActionId: input.parentId,
          ...(report?.experimentId
            ? { experimentId: report.experimentId }
            : {}),
        },
      ],
      rationale: nextStep.rationale ?? null,
      idempotencyKey,
      sideEffects: [],
    })
    .returning({ id: suggestedActions.id });

  return { childId: inserted[0].id };
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    // CAS transition on the parent report: pending → approved.
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
      });

    let parentPayload: unknown;

    if (updated.length > 0) {
      parentPayload = updated[0].payload;
    } else {
      // CAS missed: the parent is already decided (or unknown). Recover the
      // partial-failure case — parent approved but child insert lost — by
      // re-reading an approved parent and falling through to the idempotent
      // child insert.
      const parent = await db
        .select({
          payload: suggestedActions.payload,
          status: suggestedActions.status,
        })
        .from(suggestedActions)
        .where(
          and(eq(suggestedActions.id, id), eq(suggestedActions.userId, userId))
        )
        .limit(1);

      if (parent.length === 0) {
        return jsonError('not-found', 404);
      }
      if (parent[0].status !== 'approved') {
        return jsonError('already-decided', 409);
      }
      parentPayload = parent[0].payload;
    }

    const result = await insertNextStepAction({
      userId,
      parentId: id,
      parentPayload,
    });

    if ('error' in result) {
      return jsonError(result.error, 422);
    }

    logger.info('[next-step] report accepted, follow-up action queued', {
      parentId: id,
      childId: result.childId,
      userId,
    });

    return NextResponse.json(
      { ok: true, parentId: id, nextActionId: result.childId },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[next-step] Failed to queue next-step action', err);
    await captureError('suggested-action next-step failed', err, {
      route: '/api/connectors/suggested-actions/[id]/next-step',
      approvalId: id,
    });
    return jsonError('internal-error', 500);
  }
}
