import { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  buildInvalidRequestResponse,
  unsubscribeFromNotificationsDomain,
} from '@/lib/notifications/domain';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  createNotificationJsonResponse,
  createRateLimitedResponse,
  createServerErrorResponse,
} from '../route-helpers';

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIP(request);
  const rateLimitResult = await generalLimiter.limit(clientIp);

  if (!rateLimitResult.success) {
    return createRateLimitedResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const invalidResponse = buildInvalidRequestResponse();
    return createNotificationJsonResponse(
      invalidResponse.body,
      invalidResponse.status,
      rateLimitResult
    );
  }

  try {
    const result = await unsubscribeFromNotificationsDomain(body);
    return createNotificationJsonResponse(
      result.body,
      result.status,
      rateLimitResult
    );
  } catch (error) {
    logger.error('[Notifications Unsubscribe] Error:', error);
    await captureError('Notification unsubscribe failed', error, {
      route: '/api/notifications/unsubscribe',
      method: 'POST',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
