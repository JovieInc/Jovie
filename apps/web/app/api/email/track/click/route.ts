/**
 * Email Click Tracking Endpoint
 *
 * Records a click event and redirects to the target URL.
 * Used to wrap links in HTML emails.
 */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { recordEngagement, verifyTrackingToken } from '@/lib/email/tracking';
import { captureError } from '@/lib/error-tracking';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for crypto operations
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

/**
 * Validate that a URL is safe to redirect to.
 * Prevents open redirect vulnerabilities.
 */
function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    // Disallow javascript: URLs that might be URL-encoded
    if (url.toLowerCase().includes('javascript:')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('t');
    const targetUrl = request.nextUrl.searchParams.get('u');
    const linkId = request.nextUrl.searchParams.get('l') ?? undefined;

    // Validate required parameters
    if (!token || !targetUrl) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate target URL
    if (!isValidRedirectUrl(targetUrl)) {
      logger.warn('[Email Click Track] Invalid redirect URL', {
        targetUrl: targetUrl.slice(0, 100),
      });
      return NextResponse.json(
        { error: 'Invalid redirect URL' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = verifyTrackingToken(token);
    if (!payload) {
      logger.warn('[Email Click Track] Invalid tracking token');
      // Still redirect to avoid broken UX, but don't track
      return NextResponse.redirect(targetUrl, {
        status: 302,
        headers: NO_STORE_HEADERS,
      });
    }

    // Extract metadata
    const headersList = await headers();
    const userAgent = headersList.get('user-agent');
    const ipAddress = extractClientIP(headersList);
    const country = headersList.get('x-vercel-ip-country') ?? undefined;
    const city = headersList.get('x-vercel-ip-city') ?? undefined;

    // Record the click event (fire and forget for performance)
    recordEngagement({
      emailType: payload.emailType,
      eventType: 'click',
      referenceId: payload.referenceId,
      recipientEmail: payload.email,
      providerMessageId: payload.messageId,
      metadata: {
        clickUrl: targetUrl,
        linkId,
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
      logger.error('[Email Click Track] Failed to record engagement', {
        error: error instanceof Error ? error.message : 'Unknown error',
        emailType: payload.emailType,
        referenceId: payload.referenceId,
      });
    });

    // Redirect to the target URL
    return NextResponse.redirect(targetUrl, {
      status: 302,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[Email Click Track] Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Email click tracking failed', error, {
      route: '/api/email/track/click',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
