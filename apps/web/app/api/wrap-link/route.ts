/**
 * Link Wrapping API Route
 * Creates wrapped links with anti-cloaking protection
 *
 * Rate Limiting: ENABLED - 30 links per hour per IP
 * Protects against link spam and abuse.
 */

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  createRateLimitHeaders,
  getClientIP,
  linkWrapLimiter,
} from '@/lib/rate-limit';
import { createWrappedLink } from '@/lib/services/link-wrapping';
import { detectBot } from '@/lib/utils/bot-detection';
import { isValidUrl } from '@/lib/utils/url-encryption';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

interface RequestBody {
  url: string;
  platform?: string;
  customAlias?: string;
  expiresInHours?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Basic bot detection (less aggressive for this endpoint)
    const _botResult = detectBot(request, '/api/wrap-link'); // eslint-disable-line @typescript-eslint/no-unused-vars

    // Rate limiting - 30 links per hour per IP
    const clientIP = getClientIP(request);
    const rateLimitResult = await linkWrapLimiter.limit(clientIP);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            ...createRateLimitHeaders(rateLimitResult),
          },
        }
      );
    }

    // Parse request body
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { url, customAlias, expiresInHours } = body;
    const _platform = body.platform || 'external'; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Validate URL
    if (!url || !isValidUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Get user ID if authenticated
    let userId: string | undefined;
    try {
      const { userId: authUserId } = await auth();
      userId = authUserId || undefined;
    } catch {
      // Not authenticated, continue without user ID
    }

    // Create wrapped link
    const wrappedLink = await createWrappedLink({
      url,
      userId,
      customAlias,
      expiresInHours,
    });

    if (!wrappedLink) {
      return NextResponse.json(
        { error: 'Failed to create wrapped link' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Return wrapped link data
    return NextResponse.json(
      {
        shortId: wrappedLink.shortId,
        kind: wrappedLink.kind,
        domain: wrappedLink.domain,
        category: wrappedLink.category,
        titleAlias: wrappedLink.titleAlias,
        normalUrl: `/go/${wrappedLink.shortId}`,
        sensitiveUrl: `/out/${wrappedLink.shortId}`,
        createdAt: wrappedLink.createdAt,
        expiresAt: wrappedLink.expiresAt,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Link wrapping API error', error, {
      route: '/api/wrap-link',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
