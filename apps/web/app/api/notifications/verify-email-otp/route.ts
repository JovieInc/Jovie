import { NextRequest } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import {
  buildInvalidRequestResponse,
  verifyEmailOtpDomain,
} from '@/lib/notifications/domain';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import {
  createRateLimiter,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  createNotificationJsonResponse,
  createServerErrorResponse,
} from '../route-helpers';

export const runtime = 'nodejs';

const emailOtpVerifyLimiter = createRateLimiter({
  name: 'Email OTP Verify',
  limit: 10,
  window: '10 m',
  prefix: 'notifications:email-otp:verify',
  analytics: true,
});

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const ipRateLimitResult = await generalLimiter.limit(ip);

  if (!ipRateLimitResult.success) {
    return createNotificationJsonResponse(
      {
        success: false,
        error: 'Too many requests. Please wait and try again.',
        code: 'rate_limited',
      },
      429,
      ipRateLimitResult
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const invalidResponse = buildInvalidRequestResponse();
    return createNotificationJsonResponse(
      invalidResponse.body,
      invalidResponse.status,
      ipRateLimitResult
    );
  }

  const email =
    body && typeof body === 'object' && 'email' in body
      ? normalizeSubscriptionEmail(
          String((body as { email?: string }).email ?? '')
        )
      : null;

  const limiterKey = email ? `${email}:${ip}` : ip;
  const limitResult = await emailOtpVerifyLimiter.limit(limiterKey);
  if (!limitResult.success) {
    return createNotificationJsonResponse(
      {
        success: false,
        error: 'Too many verification attempts. Try again shortly.',
        code: 'rate_limited',
      },
      429,
      limitResult
    );
  }

  try {
    const result = await verifyEmailOtpDomain(body);
    return createNotificationJsonResponse(
      result.body,
      result.status,
      limitResult
    );
  } catch (error) {
    logger.error('[Notifications Verify OTP] Error:', error);
    await captureError('Notification verify email OTP failed', error, {
      route: '/api/notifications/verify-email-otp',
      method: 'POST',
    });
    return createServerErrorResponse(limitResult);
  }
}
