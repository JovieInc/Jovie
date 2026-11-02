/**
 * Promo Download OTP Request
 *
 * Public endpoint. Fan submits email to receive a 6-digit OTP code
 * for downloading promo tracks. Rate-limited per IP and email.
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { promoDownloads } from '@/lib/db/schema/promo-downloads';
import {
  getPromoDownloadOtpHtml,
  getPromoDownloadOtpSubject,
  getPromoDownloadOtpText,
} from '@/lib/email/templates/promo-download-otp';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  emailOtpResendCooldownLimiter,
  emailOtpSendLimiter,
} from '@/lib/notifications/email-otp-limiters';
import { requestEmailOtp } from '@/lib/notifications/otp-service';
import { sendNotification } from '@/lib/notifications/service';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { decodeCityHeader } from '../_geo';

export const runtime = 'nodejs';

const requestOtpSchema = z.object({
  email: z.string().email(),
  /** Honeypot field — if filled, silently succeed without sending OTP */
  website: z.string().optional(),
});

async function limitPromoOtp(
  request: NextRequest,
  rawEmail: string
): Promise<NextResponse | null> {
  let blocked: Awaited<ReturnType<typeof generalLimiter.limit>> | null = null;
  const ipResult = await generalLimiter.limit(getClientIP(request));
  if (!ipResult.success) blocked = ipResult;
  if (!blocked) {
    const email = normalizeSubscriptionEmail(rawEmail) ?? rawEmail;
    for (const limiter of [
      emailOtpResendCooldownLimiter,
      emailOtpSendLimiter,
    ]) {
      const result = await limiter.limit(email);
      if (!result.success) {
        blocked = result;
        break;
      }
    }
  }
  if (!blocked) return null;
  return NextResponse.json(
    { error: 'Too many requests. Please wait and try again.' },
    {
      status: 429,
      headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(blocked) },
    }
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = requestOtpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Honeypot check — bots fill the hidden "website" field
    if (parsed.data.website) {
      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Fetch promo download + verify active + artist is Pro
    const [download] = await db
      .select({
        id: promoDownloads.id,
        creatorProfileId: promoDownloads.creatorProfileId,
        releaseId: promoDownloads.releaseId,
        title: promoDownloads.title,
        artworkUrl: promoDownloads.artworkUrl,
        isActive: promoDownloads.isActive,
        artistName: creatorProfiles.displayName,
        isPro: users.isPro,
      })
      .from(promoDownloads)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, promoDownloads.creatorProfileId)
      )
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(promoDownloads.id, id))
      .limit(1);

    if (!download?.isActive || !download?.isPro) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Requesting a code resets the per-code attempt cap, so unlimited requests
    // would mean unlimited guesses. Same limiters as the fan subscribe OTP. Runs after the promo
    // lookup so made-up ids cannot burn a victim's per-email budget.
    const limited = await limitPromoOtp(request, parsed.data.email);
    if (limited) return limited;

    // Extract geo from headers
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const country = request.headers.get('x-vercel-ip-country') ?? null;
    const city = decodeCityHeader(request.headers.get('x-vercel-ip-city'));

    // Request OTP via shared service
    const result = await requestEmailOtp({
      email: parsed.data.email,
      creatorProfileId: download.creatorProfileId,
      source: 'promo_download',
      preferencesMerge: { promo: true },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
      geo: { country, city },
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_STORE_HEADERS }
      );
    }

    // Send promo-specific OTP email
    const artistName = download.artistName ?? 'this artist';
    const dedupKey = `promo_otp:${download.creatorProfileId}:${result.normalizedEmail}`;

    await sendNotification(
      {
        id: dedupKey,
        dedupKey,
        category: 'transactional',
        emailRoute: {
          stream: 'transactional',
          purpose: 'promo-download-otp',
          consent: 'auth-request',
        },
        subject: getPromoDownloadOtpSubject({
          title: download.title,
          artistName,
          otpCode: result.otpCode,
        }),
        text: getPromoDownloadOtpText({
          title: download.title,
          artistName,
          otpCode: result.otpCode,
          artworkUrl: download.artworkUrl,
        }),
        html: getPromoDownloadOtpHtml({
          title: download.title,
          artistName,
          otpCode: result.otpCode,
          artworkUrl: download.artworkUrl,
        }),
        channels: ['email'],
        respectUserPreferences: false,
        dismissible: false,
      },
      {
        email: result.normalizedEmail,
        creatorProfileId: download.creatorProfileId,
      }
    );

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    captureError('Promo download OTP request error', err);
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
