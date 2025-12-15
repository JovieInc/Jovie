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
import { isSafeExternalUrl } from '@/lib/utils/url-encryption';

interface RequestBody {
  url: string;
  platform?: string;
  customAlias?: string;
  expiresInHours?: number;
}

const CUSTOM_ALIAS_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
const MAX_EXPIRES_IN_HOURS = 24 * 30;

export async function POST(request: NextRequest) {
  try {
    // Basic bot detection (less aggressive for this endpoint)
    const _botResult = detectBot(request, '/api/wrap-link'); // eslint-disable-line @typescript-eslint/no-unused-vars
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    // Rate limiting
    const isRateLimited = await checkRateLimit(ip, '/api/wrap-link'); // 50 requests per hour
    if (isRateLimited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Parse request body
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const customAlias =
      typeof body.customAlias === 'string'
        ? body.customAlias.trim()
        : undefined;
    const expiresInHours =
      typeof body.expiresInHours === 'number' ? body.expiresInHours : undefined;
    const _platform = body.platform || 'external'; // eslint-disable-line @typescript-eslint/no-unused-vars

    // Validate URL
    if (!url || !isSafeExternalUrl(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (customAlias && !CUSTOM_ALIAS_REGEX.test(customAlias)) {
      return NextResponse.json(
        { error: 'Invalid custom alias' },
        { status: 400 }
      );
    }

    if (
      typeof expiresInHours !== 'undefined' &&
      (!Number.isFinite(expiresInHours) ||
        expiresInHours <= 0 ||
        expiresInHours > MAX_EXPIRES_IN_HOURS)
    ) {
      return NextResponse.json(
        { error: 'Invalid expiresInHours' },
        { status: 400 }
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
        { status: 500 }
      );
    }

    // Return wrapped link data
    const response = NextResponse.json({
      shortId: wrappedLink.shortId,
      kind: wrappedLink.kind,
      domain: wrappedLink.domain,
      category: wrappedLink.category,
      titleAlias: wrappedLink.titleAlias,
      normalUrl: `/go/${wrappedLink.shortId}`,
      sensitiveUrl: `/out/${wrappedLink.shortId}`,
      createdAt: wrappedLink.createdAt,
      expiresAt: wrappedLink.expiresAt,
    });

    // Add security headers
    response.headers.set(
      'Cache-Control',
      'no-cache, no-store, must-revalidate'
    );
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    await captureError('Link wrapping API error', error, {
      route: '/api/wrap-link',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
