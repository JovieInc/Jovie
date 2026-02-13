import { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  buildInvalidRequestResponse,
  getNotificationStatusDomain,
} from '@/lib/notifications/domain';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  createNotificationJsonResponse,
  createRateLimitedResponse,
  createServerErrorResponse,
} from '../route-helpers';

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
    const result = await getNotificationStatusDomain(body);
    return createNotificationJsonResponse(
      result.body,
      result.status,
      rateLimitResult
    );
  } catch (error) {
    logger.error('[Notifications Status] Error:', error);
    await captureError('Notification status fetch failed', error, {
      route: '/api/notifications/status',
      method: 'POST',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
