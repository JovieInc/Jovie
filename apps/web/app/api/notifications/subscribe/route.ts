import { NextRequest, NextResponse } from 'next/server';
import { isSecureEnv } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  AUDIENCE_COOKIE_NAME,
  buildInvalidRequestResponse,
  subscribeToNotificationsDomain,
} from '@/lib/notifications/domain';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

// Resend + DB access requires Node runtime
export const runtime = 'nodejs';

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIP(request);
  const rateLimitResult = await generalLimiter.limit(clientIp);

  if (!rateLimitResult.success) {
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
          ...createRateLimitHeaders(rateLimitResult),
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
        ...createRateLimitHeaders(rateLimitResult),
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
        ...createRateLimitHeaders(rateLimitResult),
      },
    });

    if (result.audienceIdentified) {
      response.cookies.set(AUDIENCE_COOKIE_NAME, '1', {
        httpOnly: true,
        secure: isSecureEnv(),
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    logger.error('[Notifications Subscribe] Error:', error);
    await captureError('Notification subscription failed', error, { route: '/api/notifications/subscribe', method: 'POST' });
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
          ...createRateLimitHeaders(rateLimitResult),
        },
      }
    );
    return response;
  }
}
