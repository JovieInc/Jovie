/**
 * Email Open Tracking Endpoint
 *
 * Returns a 1x1 transparent GIF and records the open event.
 * Used as a tracking pixel in HTML emails.
 */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { recordEngagement, verifyTrackingToken } from '@/lib/email/tracking';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for crypto operations
export const runtime = 'nodejs';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const GIF_HEADERS = {
  'Content-Type': 'image/gif',
  'Content-Length': TRANSPARENT_GIF.length.toString(),
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

function inferDeviceType(
  userAgent: string | null
): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) {
    return 'mobile';
  }
  return 'desktop';
}

export async function GET(request: NextRequest) {
  // Always return the GIF, even on errors (to avoid broken images)
  const gifResponse = () =>
    new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: GIF_HEADERS,
    });

  try {
    const token = request.nextUrl.searchParams.get('t');

    if (!token) {
      return gifResponse();
    }

    const payload = verifyTrackingToken(token);
    if (!payload) {
      logger.warn('[Email Open Track] Invalid tracking token');
      return gifResponse();
    }

    // Extract metadata
    const headersList = await headers();
    const userAgent = headersList.get('user-agent');
    const ipAddress = extractClientIP(headersList);
    const country = headersList.get('x-vercel-ip-country') ?? undefined;
    const city = headersList.get('x-vercel-ip-city') ?? undefined;

    // Record the open event (fire and forget for performance)
    recordEngagement({
      emailType: payload.emailType,
      eventType: 'open',
      referenceId: payload.referenceId,
      recipientEmail: payload.email,
      providerMessageId: payload.messageId,
      metadata: {
        userAgent: userAgent ?? undefined,
        ipHash: ipAddress
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(ipAddress)
              .digest('hex')
              .slice(0, 16)
          : undefined,
        deviceType: inferDeviceType(userAgent),
        country,
        city,
      },
    }).catch(error => {
      logger.error('[Email Open Track] Failed to record engagement', {
        error: error instanceof Error ? error.message : 'Unknown error',
        emailType: payload.emailType,
        referenceId: payload.referenceId,
      });
    });

    return gifResponse();
  } catch (error) {
    logger.error('[Email Open Track] Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Email open tracking failed', error, { route: '/api/email/track/open', method: 'GET' });
    return gifResponse();
  }
}
