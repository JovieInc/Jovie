import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ASK_JOVIE_INTENTS } from '@/lib/ask-jovie/intent';
import { getCachedAuth } from '@/lib/auth/cached';
import { getSocialReplyRankingFeatureKeys } from '@/lib/connectors/social-reply-draft';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import { createFeedbackItem } from '@/lib/feedback';
import { parseJsonBody } from '@/lib/http/parse-json';
import { notifySlackFeedbackSubmission } from '@/lib/notifications/providers/slack';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';

const payloadSchema = z.object({
  message: z.string().trim().min(5).max(2000),
  source: z.string().trim().min(1).max(80).default('dashboard'),
  pathname: z.string().trim().max(512).nullable().optional(),
  suggestedActionId: z.string().uuid().optional(),
  rating: z.enum(['positive', 'negative']).optional(),
  intent: z.enum(ASK_JOVIE_INTENTS).optional(),
});

export const runtime = 'nodejs';

/** Max feedback body size: 16KB (message alone capped at 2000 chars). */
const MAX_BODY_SIZE = 16 * 1024;

async function loadSocialInboxFeatureKeys(input: {
  readonly suggestedActionId?: string;
  readonly userId?: string;
}): Promise<readonly string[]> {
  if (!input.suggestedActionId || !input.userId) return [];
  try {
    const [action] = await db
      .select({
        kind: suggestedActions.kind,
        payload: suggestedActions.payload,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.id, input.suggestedActionId),
          eq(suggestedActions.userId, input.userId)
        )
      )
      .limit(1);
    return action
      ? getSocialReplyRankingFeatureKeys({
          id: input.suggestedActionId,
          kind: action.kind,
          payload: action.payload,
        })
      : [];
  } catch (error) {
    logger.warn('[api/feedback] unable to snapshot social ranking features', {
      suggestedActionId: input.suggestedActionId,
      error,
    });
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await getCachedAuth();

    // Rate limit by userId when available, otherwise by client IP. Prevents
    // unauthenticated flooding of the feedback DB + Slack channel.
    const clientIp = getClientIP(request);
    const limiterKey = userId ?? clientIp;
    const rateLimit = await generalLimiter.limit(limiterKey);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many feedback submissions' },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimit),
        }
      );
    }

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: '/api/feedback',
      maxBodySize: MAX_BODY_SIZE,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = payloadSchema.safeParse(parsedBody.data);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const message = parsed.data.message;
    const source = parsed.data.source;
    const pathname = parsed.data.pathname ?? null;

    const userRecord = userId
      ? await db.query.users.findFirst({
          where: eq(users.clerkId, userId),
          columns: { id: true, name: true },
        })
      : null;
    const socialInboxFeatureKeys = await loadSocialInboxFeatureKeys({
      suggestedActionId: parsed.data.suggestedActionId,
      userId: userRecord?.id,
    });

    const feedback = await createFeedbackItem({
      userId: userRecord?.id ?? null,
      message,
      source,
      context: {
        pathname,
        userAgent: request.headers.get('user-agent'),
        timestampIso: new Date().toISOString(),
        ...(parsed.data.suggestedActionId
          ? { suggestedActionId: parsed.data.suggestedActionId }
          : {}),
        ...(parsed.data.rating ? { rating: parsed.data.rating } : {}),
        ...(socialInboxFeatureKeys.length > 0
          ? { socialInboxFeatureKeys }
          : {}),
        ...(parsed.data.intent ? { intent: parsed.data.intent } : {}),
      },
    });

    notifySlackFeedbackSubmission({
      message,
      name: userRecord?.name ?? 'Jovie user',
      source,
      pathname,
    }).catch(err => {
      logger.warn('[api/feedback] Slack notification failed', err);
    });

    return NextResponse.json({ ok: true, id: feedback.id });
  } catch (error) {
    logger.error('[api/feedback] Failed to submit feedback:', error);
    await captureError('Feedback submission failed', error, {
      route: '/api/feedback',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Unable to submit feedback' },
      { status: 500 }
    );
  }
}
