import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import {
  createRateLimitHeaders,
  getClientIP,
  waitlistJoinLimiter,
} from '@/lib/rate-limit';
import {
  classifyTurnstileFailure,
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/lib/turnstile/verify';
import { logger } from '@/lib/utils/logger';
import { isPublicSignupClosed } from '@/lib/waitlist/public-signup-gate';
import { joinWaitlistWithRole } from '@/lib/waitlist/role-entry';
import { waitlistRoleSchema } from '@/lib/waitlist/roles';

/**
 * Anonymous closed-signup waitlist join (canon/PRODUCT.md, 2026-11-02).
 *
 * Bot protection matches the public changelog form: a durable per-IP limiter
 * (1 per 10 s, Redis, denies on outage) and Cloudflare Turnstile. The route
 * is inert (404) unless `PUBLIC_SIGNUP_CLOSED` is on. A known email gets the
 * same response as a new one, so the form never reveals who is waitlisted.
 */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: waitlistRoleSchema,
  turnstileToken: z.string().max(4096).optional(),
});

function json(body: Record<string, unknown>, status: number, headers = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

async function verifyTurnstile(
  token: string,
  ip: string,
  hostname: string | null
): Promise<'verified' | 'rejected' | 'unavailable'> {
  if (!isTurnstileConfigured()) {
    if (env.NODE_ENV === 'production') {
      logger.error('TURNSTILE_SECRET_KEY not configured in production');
      return 'unavailable';
    }
    return 'verified';
  }
  const result = await verifyTurnstileToken(token, ip, hostname);
  if (result.success) return 'verified';
  return classifyTurnstileFailure(result);
}

export async function POST(request: NextRequest) {
  if (!isPublicSignupClosed()) {
    return json({ error: 'Not found' }, 404);
  }

  const ip = getClientIP(request);
  const rateLimitResult = await waitlistJoinLimiter.limit(ip);
  if (!rateLimitResult.success) {
    const unavailable =
      rateLimitResult.reason?.includes('temporarily unavailable') ?? false;
    return json(
      {
        error: unavailable
          ? 'The waitlist is temporarily unavailable.'
          : 'Too many requests. Please try again in a moment.',
      },
      unavailable ? 503 : 429,
      {
        ...createRateLimitHeaders(rateLimitResult),
        ...(unavailable ? { 'Retry-After': '10' } : {}),
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Choose a role and enter a valid email.' }, 400);
  }

  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    null;
  const turnstile = await verifyTurnstile(
    parsed.data.turnstileToken ?? '',
    ip,
    host
  );
  if (turnstile === 'rejected') {
    return json({ error: 'Bot verification failed. Please try again.' }, 403);
  }
  if (turnstile === 'unavailable') {
    return json(
      { error: 'Bot verification unavailable. Please try again.' },
      503
    );
  }

  try {
    await joinWaitlistWithRole({
      email: parsed.data.email,
      role: parsed.data.role,
    });
  } catch (error) {
    logger.error('[api/waitlist/join] join failed', error);
    await captureError('Waitlist role join failed', error, {
      route: '/api/waitlist/join',
      method: 'POST',
    });
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }

  return json({ state: 'joined' }, 201);
}
