import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productUpdateSubscribers } from '@/lib/db/schema/product-update-subscribers';
import { sendEmail } from '@/lib/email/send';
import { getChangelogVerifyEmail } from '@/lib/email/templates/changelog-verify';

// Simple in-memory rate limiter: IP → last request timestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000; // 10 seconds between requests per IP

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return true;
  rateLimitMap.set(ip, now);
  // Prevent unbounded growth
  if (rateLimitMap.size > 10_000) {
    const cutoff = now - RATE_LIMIT_MS * 2;
    for (const [key, ts] of rateLimitMap) {
      if (ts < cutoff) rateLimitMap.delete(key);
    }
  }
  return false;
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // If no Turnstile secret configured, skip verification (dev mode)
    console.warn(
      'TURNSTILE_SECRET_KEY not set, skipping Turnstile verification'
    );
    return true;
  }
  if (!token) return false;

  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      }
    );
    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    );
  }

  let body: { email?: string; turnstileToken?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'Valid email required' },
      { status: 400 }
    );
  }

  // Verify Turnstile
  const turnstileValid = await verifyTurnstile(body.turnstileToken ?? '', ip);
  if (!turnstileValid) {
    return NextResponse.json(
      { error: 'Bot verification failed. Please try again.' },
      { status: 403 }
    );
  }

  // Check for existing subscriber
  const [existing] = await db
    .select()
    .from(productUpdateSubscribers)
    .where(eq(productUpdateSubscribers.email, email))
    .limit(1);

  if (existing) {
    if (existing.verified && !existing.unsubscribedAt) {
      return NextResponse.json(
        { message: 'Already subscribed!' },
        { status: 200 }
      );
    }

    // Resubscribe: clear unsubscribedAt, generate new tokens
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
        source: body.source ?? 'changelog_page',
        updatedAt: new Date(),
      })
      .where(eq(productUpdateSubscribers.id, existing.id));

    // Send verification email
    const emailContent = getChangelogVerifyEmail({ verificationToken });
    await sendEmail({
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    }).catch(err => console.error('Failed to send verification email:', err));

    return NextResponse.json(
      { message: 'Check your email to confirm your subscription!' },
      { status: 201 }
    );
  }

  // New subscriber
  const verificationToken = crypto.randomUUID();
  const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(productUpdateSubscribers).values({
    email,
    verificationToken,
    tokenExpiresAt,
    source: body.source ?? 'changelog_page',
  });

  // Send verification email
  const emailContent = getChangelogVerifyEmail({ verificationToken });
  await sendEmail({
    to: email,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  }).catch(err => console.error('Failed to send verification email:', err));

  return NextResponse.json(
    { message: 'Check your email to confirm your subscription!' },
    { status: 201 }
  );
}
