import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvalidRequestResponse,
  unsubscribeFromNotificationsDomain,
} from '@/lib/notifications/domain';
import {
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
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
    const result = await unsubscribeFromNotificationsDomain(body);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...createRateLimitHeaders(rateLimitResult),
      },
    });
  } catch (error) {
    logger.error('[Notifications Unsubscribe] Error:', error);
    await captureError('Notification unsubscribe failed', error, { route: '/api/notifications/unsubscribe', method: 'POST' });
    return NextResponse.json(
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
  }
}
