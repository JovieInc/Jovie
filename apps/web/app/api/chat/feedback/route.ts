import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { chatAnswerFeedback, chatAnswerTraces } from '@/lib/db/schema/chat-rag';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_SIZE = 8 * 1024;

const payloadSchema = z
  .object({
    traceId: z.string().uuid(),
    rating: z.enum(['up', 'down']),
    reason: z
      .enum([
        'wrong',
        'outdated',
        'generic',
        'hallucinated',
        'bad_source',
        'bad_tone',
        'incomplete',
      ])
      .optional(),
    correction: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // `down` ratings benefit from a reason — but it's optional in v1 so we
    // capture the rating even when the user just clicks the thumb without
    // selecting a reason. Do NOT reject for missing reason; simply don't
    // accept reasons paired with up.
    if (data.rating === 'up' && data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: '`reason` is only valid on `down` ratings.',
      });
    }
    if (data.rating === 'up' && data.correction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correction'],
        message: '`correction` is only valid on `down` ratings.',
      });
    }
  });

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await getOptionalAuth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit by user id (or IP fallback for the rare unauthed edge case
    // — getOptionalAuth returns null in those cases so we won't reach here,
    // but limiter wants a key regardless).
    const limiterKey = clerkUserId ?? getClientIP(request);
    const rl = await generalLimiter.limit(limiterKey);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many feedback submissions' },
        { status: 429, headers: createRateLimitHeaders(rl) }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: '/api/chat/feedback',
      maxBodySize: MAX_BODY_SIZE,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = payloadSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { traceId, rating, reason, correction } = parsed.data;

    // Resolve clerk → users.id (uuid) for the FK.
    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);
    if (!userRow?.id) {
      return NextResponse.json(
        { error: 'User record not found' },
        { status: 404 }
      );
    }

    // Verify the trace exists and belongs to this user. The FK does this on
    // INSERT but we fail soft up front so the client gets a clean 404 on
    // copy-pasted/expired trace ids rather than an FK violation.
    const [traceRow] = await db
      .select({
        userId: chatAnswerTraces.userId,
        messageId: chatAnswerTraces.messageId,
      })
      .from(chatAnswerTraces)
      .where(eq(chatAnswerTraces.traceId, traceId))
      .limit(1);
    if (!traceRow) {
      return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
    }
    if (traceRow.userId !== userRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Append-only with supersession: if a current row exists for this
    // (trace, user) pair, mark it superseded; then insert the new row.
    // Wrapped in a transaction so the unique partial index never sees two
    // current rows simultaneously.
    const insertedId = await db.transaction(async tx => {
      await tx
        .update(chatAnswerFeedback)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(chatAnswerFeedback.traceId, traceId),
            eq(chatAnswerFeedback.userId, userRow.id),
            isNull(chatAnswerFeedback.supersededAt)
          )
        );

      const [inserted] = await tx
        .insert(chatAnswerFeedback)
        .values({
          traceId,
          messageId: traceRow.messageId,
          userId: userRow.id,
          rating,
          reason: rating === 'down' ? (reason ?? null) : null,
          correction:
            rating === 'down' && correction && correction.length > 0
              ? correction
              : null,
        })
        .returning({ id: chatAnswerFeedback.id });
      return inserted?.id ?? null;
    });

    return NextResponse.json({ ok: true, id: insertedId }, { status: 201 });
  } catch (error) {
    captureError('chat feedback failed', error, {
      context: '/api/chat/feedback',
    });
    return NextResponse.json(
      { error: 'Failed to record feedback' },
      { status: 500 }
    );
  }
}
