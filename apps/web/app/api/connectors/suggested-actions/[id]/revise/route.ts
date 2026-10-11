/**
 * POST /api/connectors/suggested-actions/[id]/revise
 *
 * Comment-for-revision on a social reply draft (JOV-5128).
 *
 * CAS-transitions the current draft pending → rejected, records the creator's
 * feedback as a durable decision event, and inserts a new pending
 * `social_reply.draft` row whose payload appends the revision (feedback +
 * replaced draft text) and points `revisionOf` at the chain root. History is
 * preserved on the new draft; nothing here sends or approves.
 */

import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/require-auth';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { recordInboxDecision } from '@/lib/connectors/inbox-decision';
import {
  buildSocialReplyRevisionPayload,
  parseSocialReplyDraft,
} from '@/lib/connectors/social-reply-draft';
import { SOCIAL_REPLY_DRAFT_KIND } from '@/lib/connectors/suggested-action-kinds';
import { db } from '@/lib/db';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const reviseBodySchema = z.object({
  comment: z.string().trim().min(5).max(2_000),
  draftedText: z.string().trim().min(1).max(4_000).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const { userId, error } = await requireAuth();
  if (error) return error;

  let body: z.infer<typeof reviseBodySchema>;
  try {
    body = reviseBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: 'invalid-revision-request' },
      { status: 422, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const [candidate] = await db
      .select({
        kind: suggestedActions.kind,
        payload: suggestedActions.payload,
        sourceRefs: suggestedActions.sourceRefs,
        rationale: suggestedActions.rationale,
        targetConnectorAccountId: suggestedActions.targetConnectorAccountId,
        agentRunId: suggestedActions.agentRunId,
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

    const draft = parseSocialReplyDraft(candidate.kind, candidate.payload);
    if (!draft) {
      return NextResponse.json(
        { error: 'not-a-social-reply-draft' },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    // CAS transition: pending → rejected. The draft is superseded, not
    // discarded — the new row below carries the full revision history.
    const superseded = await db
      .update(suggestedActions)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(suggestedActions.id, id),
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .returning({ id: suggestedActions.id });

    if (superseded.length === 0) {
      const [existing] = await db
        .select({ status: suggestedActions.status })
        .from(suggestedActions)
        .where(
          and(eq(suggestedActions.id, id), eq(suggestedActions.userId, userId))
        )
        .limit(1);
      return NextResponse.json(
        { error: existing ? 'already-decided' : 'not-found' },
        { status: existing ? 409 : 404, headers: NO_STORE_HEADERS }
      );
    }

    const revisedPayload = buildSocialReplyRevisionPayload(draft, {
      feedback: body.comment,
      revisedAt: new Date().toISOString(),
      revisedFromActionId: id,
      ...(body.draftedText ? { draftedText: body.draftedText } : {}),
    });

    const [inserted] = await db
      .insert(suggestedActions)
      .values({
        userId,
        kind: SOCIAL_REPLY_DRAFT_KIND,
        targetConnectorAccountId: candidate.targetConnectorAccountId,
        agentRunId: candidate.agentRunId,
        payload: revisedPayload,
        signalType: 'fan_reply',
        status: 'pending',
        sourceRefs: candidate.sourceRefs,
        rationale: candidate.rationale,
        idempotencyKey: `social-reply-revision:${id}:${revisedPayload.revisions.length}`,
        sideEffects: [],
      })
      .returning({ id: suggestedActions.id });

    logger.info('[revise] social reply draft superseded by revision', {
      supersededId: id,
      newActionId: inserted.id,
      userId,
      revisionCount: revisedPayload.revisions.length,
    });

    void recordInboxDecision({
      suggestedActionId: id,
      userId,
      verdict: 'rejected',
      reason: body.comment,
      cardKind: SOCIAL_REPLY_DRAFT_KIND,
      surface: 'opportunity-inbox',
    });
    revalidateTag(CACHE_TAGS.DASHBOARD_DATA, 'max');

    return NextResponse.json(
      { ok: true, approvalId: inserted.id, supersededId: id },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    logger.error('[revise] Failed to revise social reply draft', err);
    await captureError('suggest-action revise failed', err, {
      route: '/api/connectors/suggested-actions/[id]/revise',
      approvalId: id,
    });
    return NextResponse.json(
      { error: 'internal-error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
