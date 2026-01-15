import { NextRequest, NextResponse } from 'next/server';
import {
  AUDIENCE_COOKIE_NAME,
  buildInvalidRequestResponse,
  subscribeToNotificationsDomain,
} from '@/lib/notifications/domain';
import { logger } from '@/lib/utils/logger';
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIP,
  getRateLimitStatus,
} from '@/lib/utils/rate-limit';

// Resend + DB access requires Node runtime
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIP(request);
  const rateLimited = checkRateLimit(clientIp);
  const rateLimitStatus = getRateLimitStatus(clientIp);

  if (rateLimited) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please wait and try again.',
        code: 'rate_limited',
      },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitStatus),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const invalidResponse = buildInvalidRequestResponse();
    return NextResponse.json(invalidResponse.body, {
      status: invalidResponse.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...createRateLimitHeaders(rateLimitStatus),
      },
    });
  }

  try {
    const result = await subscribeToNotificationsDomain(body, {
      headers: request.headers,
    });

    const response = NextResponse.json(result.body, {
      status: result.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...createRateLimitHeaders(rateLimitStatus),
      },
    });

    if (result.audienceIdentified) {
      // Set secure flag based on environment:
      // - Always secure in production and preview (Vercel)
      // - Secure in non-development environments
      const vercelEnv = process.env.VERCEL_ENV;
      const isSecureEnv =
        vercelEnv === 'production' ||
        vercelEnv === 'preview' ||
        process.env.NODE_ENV === 'production';

      response.cookies.set(AUDIENCE_COOKIE_NAME, '1', {
        httpOnly: true,
        secure: isSecureEnv,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    logger.error('[Notifications Subscribe] Error:', error);
    const response = NextResponse.json(
      {
        success: false,
        error: 'Server error',
        code: 'server_error',
      },
      {
        status: 500,
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rateLimitStatus),
        },
      }
    );
    return response;
  }
}
