import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  type ProductUpdateSubscriber,
  productUpdateSubscribers,
} from '@/lib/db/schema/product-update-subscribers';
import { sendEmail } from '@/lib/email/send';
import { getChangelogVerifyEmail } from '@/lib/email/templates/changelog-verify';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import {
  changelogSubscribeLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import {
  classifyTurnstileFailure,
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/lib/turnstile/verify';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length > 64 || domain.length === 0) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  for (const char of domain) {
    const isAlphaNumeric =
      (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
    if (!(isAlphaNumeric || char === '.' || char === '-')) {
      return false;
    }
  }

  return true;
}

function isLimiterUnavailable(reason: string | undefined): boolean {
  return reason?.includes('temporarily unavailable') ?? false;
}

type TurnstileVerificationResult = 'verified' | 'rejected' | 'unavailable';

async function verifyTurnstile(
  token: string,
  ip: string,
  hostname?: string | null
): Promise<TurnstileVerificationResult> {
  // Single source of truth: delegate to the shared, bounded (timeout + retry)
  // siteverify helper instead of re-implementing the Cloudflare call here.
  if (!isTurnstileConfigured()) {
    if (env.NODE_ENV === 'production') {
      logger.error('TURNSTILE_SECRET_KEY not configured in production');
      return 'unavailable';
    }

    logger.warn(
      'TURNSTILE_SECRET_KEY not set, skipping verification in non-production'
    );
    return 'verified';
  }

  const result = await verifyTurnstileToken(token, ip, hostname);
  if (result.success) return 'verified';
  return classifyTurnstileFailure(result);
}

async function sendVerificationEmail(
  email: string,
  verificationToken: string
): Promise<void> {
  const emailContent = getChangelogVerifyEmail({ verificationToken });
  await sendEmail({
    to: email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}

async function handleExistingSubscriber(
  existing: ProductUpdateSubscriber,
  email: string,
  source: string | undefined
): Promise<NextResponse> {
  if (existing.verified && !existing.unsubscribedAt) {
    return NextResponse.json(
      { message: 'Already subscribed!' },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const verificationToken = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(productUpdateSubscribers)
    .set({
      verified: false,
      verificationToken,
      tokenExpiresAt,
      unsubscribeToken: crypto.randomUUID(),
      unsubscribedAt: null,
      source: source ?? 'changelog_page',
      updatedAt: new Date(),
    })
    .where(eq(productUpdateSubscribers.id, existing.id));

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (error) {
    await captureError('Failed to send changelog verification email', error, {
      route: '/api/changelog/subscribe',
      email,
    });
    return NextResponse.json(
      { error: 'Confirmation email unavailable. Please try again.' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { message: 'Check your email to confirm your subscription!' },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  const rateLimitResult = await changelogSubscribeLimiter.limit(ip);
  if (!rateLimitResult.success) {
    const status = isLimiterUnavailable(rateLimitResult.reason) ? 503 : 429;
    return NextResponse.json(
      {
        error:
          status === 503
            ? 'Subscription is temporarily unavailable.'
            : 'Too many requests. Please try again in a moment.',
      },
      {
        status,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
          ...(status === 503 ? { 'Retry-After': '10' } : {}),
        },
      }
    );
  }

  let body: { email?: string; turnstileToken?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Valid email required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    null;
  const turnstileResult = await verifyTurnstile(
    body.turnstileToken ?? '',
    ip,
    host
  );
  if (turnstileResult === 'rejected') {
    return NextResponse.json(
      { error: 'Bot verification failed. Please try again.' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  if (turnstileResult === 'unavailable') {
    return NextResponse.json(
      { error: 'Bot verification unavailable. Please try again.' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const [existing] = await db
    .select()
    .from(productUpdateSubscribers)
    .where(eq(productUpdateSubscribers.email, email))
    .limit(1);

  if (existing) {
    return handleExistingSubscriber(existing, email, body.source);
  }

  const verificationToken = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(productUpdateSubscribers).values({
    email,
    verificationToken,
    tokenExpiresAt,
    source: body.source ?? 'changelog_page',
  });

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (error) {
    await captureError('Failed to send changelog verification email', error, {
      route: '/api/changelog/subscribe',
      email,
    });
    return NextResponse.json(
      { error: 'Confirmation email unavailable. Please try again.' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { message: 'Check your email to confirm your subscription!' },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}
