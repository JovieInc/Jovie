/**
 * Email Click Tracking Endpoint
 *
 * Records a click event and redirects to the target URL.
 * Used to wrap links in HTML emails.
 */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import {
  hashIP,
  inferDeviceType,
  isFirstPartyClickDestination,
  recordEngagement,
  safeEqualString,
  verifyTrackingToken,
} from '@/lib/email/tracking';
import { captureError } from '@/lib/error-tracking';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

// Force Node.js runtime for crypto operations
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    // Security: explicitly reject javascript: protocol to prevent XSS via redirect.
    // This check is intentional and required even after the protocol allowlist above,
    // because URL-encoded or mixed-case variants could bypass protocol parsing.
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

    // Fail closed: never redirect on an invalid/missing token (SEC-18).
    const payload = verifyTrackingToken(token);
    if (!payload) {
      logger.warn('[Email Click Track] Invalid tracking token');
      return NextResponse.json(
        { error: 'Invalid tracking token' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Resolve redirect destination without reintroducing open redirects:
    // - New tokens: `clickUrl` is HMAC-bound; query `u` must match.
    // - Legacy unbound tokens: allow only first-party hosts (claim/recovery).
    let redirectUrl: string;
    if (payload.clickUrl) {
      if (!safeEqualString(payload.clickUrl, targetUrl)) {
        logger.warn('[Email Click Track] Click URL does not match token');
        return NextResponse.json(
          { error: 'Invalid tracking token' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      redirectUrl = payload.clickUrl;
    } else if (isFirstPartyClickDestination(targetUrl)) {
      redirectUrl = targetUrl;
    } else {
      logger.warn(
        '[Email Click Track] Unbound token with non-first-party destination'
      );
      return NextResponse.json(
        { error: 'Invalid tracking token' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Extract metadata
    const headersList = await headers();
    const userAgent = headersList.get('user-agent');
    const ipAddress = extractClientIP(headersList);
    const country = headersList.get('x-vercel-ip-country') ?? undefined;
    const city = headersList.get('x-vercel-ip-city') ?? undefined;

    // Record the click event after response is sent (survives serverless teardown)
    const engagementData = {
      emailType: payload.emailType,
      eventType: 'click' as const,
      referenceId: payload.referenceId,
      recipientEmail: payload.email,
      providerMessageId: payload.messageId,
      metadata: {
        clickUrl: redirectUrl,
        linkId,
        userAgent: userAgent ?? undefined,
        ipHash: hashIP(ipAddress),
        deviceType: inferDeviceType(userAgent),
        country,
        city,
      },
    };
    scheduleAfter(async () => {
      const result = await recordEngagement(engagementData);
      if (!result.success) {
        logger.error('[Email Click Track] Failed to record engagement', {
          error: result.error ?? 'Unknown error',
          emailType: payload.emailType,
          referenceId: payload.referenceId,
        });
      }
    });

    // Redirect to the HMAC-bound target URL
    return NextResponse.redirect(redirectUrl, {
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
