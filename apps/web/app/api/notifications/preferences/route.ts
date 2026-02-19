import { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  buildInvalidRequestResponse,
  updateContentPreferencesDomain,
} from '@/lib/notifications/domain';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  createNotificationJsonResponse,
  createRateLimitedResponse,
  createServerErrorResponse,
} from '../route-helpers';

export const runtime = 'nodejs';

/**
 * PATCH handler for updating content notification preferences.
 * Allows fans to toggle individual content categories (music, tours, merch, general).
 */
export async function PATCH(request: NextRequest) {
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
    const result = await updateContentPreferencesDomain(body);
    return createNotificationJsonResponse(
      result.body,
      result.status,
      rateLimitResult
    );
  } catch (error) {
    logger.error('[Notifications Preferences] Error:', error);
    await captureError('Notification preferences update failed', error, {
      route: '/api/notifications/preferences',
      method: 'PATCH',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
