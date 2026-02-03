/**
 * Link Wrapping API Route
 * Creates wrapped links with anti-cloaking protection
 *
 * Rate Limiting Status: IMPLEMENTED BUT DISABLED
 * This endpoint calls checkRateLimit() which is currently globally disabled in lib/utils/bot-detection.ts.
 * Following YC principle: "do things that don't scale until you have to"
 *
 * Rate limiting will be enabled when:
 * - Wrapped link creation exceeds ~10k/day
 * - Abuse/spam patterns detected in PostHog
 * - Link shortening abuse becomes measurable
 *
 * Current Protection:
 * - Basic URL validation
 * - Bot detection (less aggressive)
 * - Auth optional (allows anonymous usage for growth)
 *
 * Future Considerations:
 * - Enable rate limiting (50/hour per IP is already configured)
 * - Add CAPTCHA for anonymous users after N links
 * - Implement link expiration cleanup job
 * - Track abuse patterns in PostHog
 */

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { createWrappedLink } from '@/lib/services/link-wrapping';
import { checkRateLimit, detectBot } from '@/lib/utils/bot-detection';
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
    const _botResult = detectBot(request, '/api/wrap-link');
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Rate limiting
    const isRateLimited = await checkRateLimit(ip, '/api/wrap-link'); // 50 requests per hour
    if (isRateLimited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: NO_STORE_HEADERS }
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
    const _platform = body.platform || 'external';

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

// Handle other HTTP methods - shared handler for unsupported methods
function methodNotAllowed() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
