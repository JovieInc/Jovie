import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvalidRequestResponse,
  unsubscribeFromNotificationsDomain,
} from '@/lib/notifications/domain';
import { logger } from '@/lib/utils/logger';
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIP,
  getRateLimitStatus,
} from '@/lib/utils/rate-limit';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
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
    const result = await unsubscribeFromNotificationsDomain(body);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        ...NO_STORE_HEADERS,
        ...createRateLimitHeaders(rateLimitStatus),
      },
    });
  } catch (error) {
    logger.error('[Notifications Unsubscribe] Error:', error);
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
          ...createRateLimitHeaders(rateLimitStatus),
        },
      }
    );
  }
}
