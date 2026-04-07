/**
 * Promo Download OTP Request
 *
 * Public endpoint. Fan submits email to receive a 6-digit OTP code
 * for downloading promo tracks. Rate-limited per IP and email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPromoDownloadOtpHtml,
  getPromoDownloadOtpSubject,
  getPromoDownloadOtpText,
} from '@/lib/email/templates/promo-download-otp';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { requestEmailOtp } from '@/lib/notifications/otp-service';
import { sendNotification } from '@/lib/notifications/service';
import { getPromoDownloadWithCreator } from '@/lib/promo-downloads/queries';
import { extractGeoFromHeaders } from '@/lib/promo-downloads/request-utils';

export const runtime = 'nodejs';

const requestOtpSchema = z.object({
  email: z.string().email(),
  /** Honeypot field — if filled, silently succeed without sending OTP */
  website: z.string().optional(),
});

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
    const download = await getPromoDownloadWithCreator(id);

    if (!download || !download.isActive || !download.isPro) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { ip, country, city } = extractGeoFromHeaders(request);

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
