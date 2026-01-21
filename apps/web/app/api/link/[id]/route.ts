/**
 * Signed URL API Route (/api/link/[id])
 * Generates time-limited signed URLs for sensitive links with bot protection
 *
 * Security Measures:
 * - Rate limiting via apiLimiter (IP-based)
 * - Bot detection (aggressive for API endpoints)
 * - Time-limited tokens (60 second TTL)
 * - Timestamp verification (5 minute window)
 * - Human verification required
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signedLinkAccess } from '@/lib/db/schema';
import { captureError } from '@/lib/error-tracking';
import { apiLimiter, createRateLimitHeaders } from '@/lib/rate-limit';
import {
  getWrappedLink,
  incrementClickCount,
} from '@/lib/services/link-wrapping';
import {
  createBotResponse,
  detectBot,
  logBotDetection,
} from '@/lib/utils/bot-detection';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { generateSignedToken } from '@/lib/utils/url-encryption.server';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Robots-Tag': 'noindex, nofollow, nosnippet, noarchive',
} as const;

interface RequestBody {
  verified?: boolean;
  timestamp?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shortId = id;
  // Use secure IP extraction with proper priority
  const ip = extractClientIP(request.headers);

  if (!shortId || shortId.length > 20) {
    return NextResponse.json(
      { error: 'Invalid link ID' },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  try {
    // Bot detection with aggressive blocking for API endpoints
    const botResult = detectBot(request, `/api/link/${shortId}`);

    // Log bot detection
    await logBotDetection(
      ip,
      botResult.userAgent,
      botResult.reason,
      `/api/link/${shortId}`,
      botResult.shouldBlock
    );

    // Block Meta crawlers and obvious bots from API endpoints
    if (botResult.shouldBlock) {
      return createBotResponse(204);
    }

    // Rate limiting for API endpoints (enabled)
    const rateLimitResult = await apiLimiter.limit(ip);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    // Parse request body
    let body: RequestBody = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Basic human verification
    if (!body.verified || !body.timestamp) {
      return NextResponse.json(
        { error: 'Verification required' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Check timestamp is recent (within 5 minutes)
    const timeDiff = Date.now() - (body.timestamp || 0);
    if (timeDiff > 5 * 60 * 1000 || timeDiff < 0) {
      return NextResponse.json(
        { error: 'Request expired' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Get wrapped link
    const wrappedLink = await getWrappedLink(shortId);

    if (!wrappedLink) {
      return NextResponse.json(
        { error: 'Link not found' },
        { status: 404, headers: SECURITY_HEADERS }
      );
    }

    // Generate signed token
    const signedToken = generateSignedToken();
    const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds TTL

    // Store signed access record for audit trail
    try {
      await db.insert(signedLinkAccess).values({
        linkId: wrappedLink.id,
        signedToken,
        ipAddress: ip,
        userAgent: botResult.userAgent.substring(0, 500),
        expiresAt,
      });
    } catch (dbError) {
      // Log but don't fail the request - audit is secondary to functionality
      await captureError('Failed to store signed link access record', dbError, {
        linkId: wrappedLink.id,
        route: '/api/link/[id]',
      });
    }

    // Increment click count asynchronously
    incrementClickCount(shortId).catch(async error => {
      await captureError('Failed to increment click count', error, {
        shortId,
        route: '/api/link/[id]',
      });
    });

    // Return the original URL directly (single-use)
    return NextResponse.json(
      {
        url: wrappedLink.originalUrl,
        expiresAt: expiresAt.toISOString(),
      },
      { headers: SECURITY_HEADERS }
    );
  } catch (error) {
    await captureError('Signed URL API error', error, {
      route: '/api/link/[id]',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

// Handle other HTTP methods - shared handler for unsupported methods
function methodNotAllowed() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: SECURITY_HEADERS }
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
