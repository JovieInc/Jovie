import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ASK_JOVIE_INTENTS,
  ASK_JOVIE_MESSAGE_CATEGORIES,
  answerProfileQuestion,
} from '@/lib/ask-jovie/answer';
import { loadAskJovieContext } from '@/lib/ask-jovie/context';
import { db } from '@/lib/db';
import { profileInquiries } from '@/lib/db/schema/profile-inquiries';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import {
  createRateLimiter,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  isReservedUsername,
  USERNAME_MAX_LENGTH,
} from '@/lib/validation/username-core';

// DB access requires Node runtime.
export const runtime = 'nodejs';

const askLimiter = createRateLimiter({
  name: 'Ask Jovie',
  limit: 20,
  window: '10 m',
  prefix: 'ask-jovie',
  analytics: false,
  algorithm: 'fixed-window',
  trafficClass: 'anonymous',
});

const questionSchema = z.object({
  action: z.literal('question'),
  question: z.string().min(1).max(500),
});

const messageSchema = z.object({
  action: z.literal('message'),
  category: z.enum(ASK_JOVIE_MESSAGE_CATEGORIES).default('fan_mail'),
  message: z.string().min(1).max(2000),
  name: z.string().max(120).optional(),
  email: z.string().max(254).optional(),
  question: z.string().max(500).optional(),
});

const intentSchema = z.object({
  action: z.literal('intent'),
  intent: z.enum(ASK_JOVIE_INTENTS),
  email: z.string().min(3).max(254),
  name: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
});

const askSchema = z.discriminatedUnion('action', [
  questionSchema,
  messageSchema,
  intentSchema,
]);

interface RouteContext {
  readonly params: Promise<{ username: string }>;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function persistInquiry(
  input: Omit<typeof profileInquiries.$inferInsert, 'creatorProfileId'> & {
    creatorProfileId: string;
  }
) {
  try {
    await db.insert(profileInquiries).values(input);
  } catch (error) {
    // Persistence failures must not break the visitor-facing flow.
    logger.error('[Ask Jovie] Failed to persist profile inquiry', {
      error: error instanceof Error ? error.message : String(error),
      creatorProfileId: input.creatorProfileId,
      kind: input.kind,
    });
    void captureError('Ask Jovie inquiry persist failed', error, {
      route: '/api/profile/[username]/ask',
    });
  }
}

const TOO_MANY = {
  success: false,
  error: 'Too many requests. Please wait and try again.',
} as const;

export async function POST(request: NextRequest, context: RouteContext) {
  const clientIp = getClientIP(request);
  const [general, askLimit] = await Promise.all([
    generalLimiter.limit(clientIp),
    askLimiter.limit(clientIp),
  ]);
  if (!general.success || !askLimit.success) {
    return json(TOO_MANY, 429);
  }

  const { username: rawUsername } = await context.params;
  const username = (rawUsername ?? '').toLowerCase();
  if (
    !username ||
    username.length > USERNAME_MAX_LENGTH ||
    isReservedUsername(username)
  ) {
    return json({ success: false, error: 'Profile not found' }, 404);
  }

  const body = await request.json().catch(() => null);
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return json({ success: false, error: 'Invalid request' }, 400);
  }

  try {
    const { context: ctx, creatorProfileId } =
      await loadAskJovieContext(username);
    if (!ctx || !creatorProfileId) {
      return json({ success: false, error: 'Profile not found' }, 404);
    }

    const payload = parsed.data;

    if (payload.action === 'question') {
      const result = answerProfileQuestion(payload.question, ctx);
      if (result.kind === 'unknown') {
        // Persist the unanswered question so the owner sees demand signals.
        await persistInquiry({
          creatorProfileId,
          kind: 'question',
          category: 'other',
          message: payload.question,
          context: { surface: 'ask_jovie' },
        });
        return json({ answered: false });
      }
      return json({ answered: true, text: result.text });
    }

    if (payload.action === 'message') {
      const email = payload.email
        ? normalizeSubscriptionEmail(payload.email)
        : null;
      if (payload.email && !email) {
        return json(
          { success: false, error: 'Please enter a valid email address.' },
          400
        );
      }
      await persistInquiry({
        creatorProfileId,
        kind: 'message',
        category: payload.category,
        message: payload.message,
        visitorName: payload.name?.trim() || null,
        visitorEmail: email,
        originatingQuestion: payload.question ?? null,
        context: { surface: 'ask_jovie' },
      });
      return json({ success: true });
    }

    // action === 'intent' — structured audience capture: contact + intent.
    const email = normalizeSubscriptionEmail(payload.email);
    if (!email) {
      return json(
        { success: false, error: 'Please enter a valid email address.' },
        400
      );
    }
    await persistInquiry({
      creatorProfileId,
      kind: 'intent',
      category: payload.intent,
      message: `Requested ${payload.intent.replaceAll('_', ' ')}`,
      visitorName: payload.name?.trim() || null,
      visitorEmail: email,
      visitorCity: payload.city?.trim() || null,
      context: { surface: 'ask_jovie' },
    });
    return json({ success: true });
  } catch (error) {
    logger.error('[Ask Jovie] Request failed', {
      error: error instanceof Error ? error.message : String(error),
      username,
      route: '/api/profile/[username]/ask',
    });
    void captureError('Ask Jovie request failed', error, {
      route: '/api/profile/[username]/ask',
      username,
    });
    return json(
      { success: false, error: 'Something went wrong. Please try again.' },
      500
    );
  }
}
