/**
 * Link Wrapping API Route
 * Creates wrapped links with anti-cloaking protection
 *
 * Rate Limiting:
 * - Authenticated: 50 requests per hour per user
 * - Anonymous: 20 requests per hour per IP (stricter)
 * - Returns HTTP 429 with Retry-After when exceeded
 *
 * Protection:
 * - URL validation
 * - Bot detection (less aggressive)
 * - Rate limiting via unified rate-limit module
 * - Auth optional (allows anonymous usage for growth)
 */

export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  checkWrapLinkRateLimit,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';
import {
  createWrappedLink,
  deleteWrappedLink,
  updateWrappedLink,
} from '@/lib/services/link-wrapping';
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
    detectBot(request, '/api/wrap-link');

    // Get user ID if authenticated (needed for rate-limit keying)
    let userId: string | undefined;
    try {
      const { userId: authUserId } = await auth();
      userId = authUserId || undefined;
    } catch {
      // Not authenticated, continue without user ID
    }

    // Rate limiting: authenticated users get 50/hr by userId, anonymous get 20/hr by IP
    const ip = getClientIP(request);
    const isAuthenticated = Boolean(userId);
    const rateLimitIdentifier = userId ?? ip;
    const rateLimitResult = await checkWrapLinkRateLimit(
      rateLimitIdentifier,
      isAuthenticated
    );

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

    // Validate URL
    if (!url || !isValidUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
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

/**
 * PUT /api/wrap-link
 *
 * Update a wrapped link's metadata (titleAlias, expiresAt).
 * Requires authentication. Only the creator can update their link.
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: {
      shortId?: string;
      titleAlias?: string;
      expiresAt?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!body.shortId) {
      return NextResponse.json(
        { error: 'shortId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const updated = await updateWrappedLink(
      body.shortId,
      {
        titleAlias: body.titleAlias,
        expiresAt: body.expiresAt ?? undefined,
      },
      authUserId
    );

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update link' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Link wrapping PUT error', error, {
      route: '/api/wrap-link',
      method: 'PUT',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * DELETE /api/wrap-link
 *
 * Delete a wrapped link by shortId.
 * Requires authentication. Only the creator can delete their link.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    let body: { shortId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!body.shortId) {
      return NextResponse.json(
        { error: 'shortId is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const deleted = await deleteWrappedLink(body.shortId, authUserId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Link not found or not owned by you' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Link wrapping DELETE error', error, {
      route: '/api/wrap-link',
      method: 'DELETE',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: NO_STORE_HEADERS }
  );
}
