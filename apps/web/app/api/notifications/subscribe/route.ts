import { NextRequest } from 'next/server';
import { isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import {
  AUDIENCE_COOKIE_NAME,
  buildInvalidRequestResponse,
  subscribeToNotificationsDomain,
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
  createRateLimitedResponse,
  createServerErrorResponse,
} from '../route-helpers';

// Resend + DB access requires Node runtime
export const runtime = 'nodejs';

const emailOtpSendLimiter = createRateLimiter({
  name: 'Email OTP Send',
  limit: 5,
  window: '10 m',
  prefix: 'notifications:email-otp:send',
  analytics: true,
});

// Server-side resend cooldown: enforces a single OTP send per email per
// 30-second window so the UI cooldown ("Resend in Ns") cannot be bypassed
// by callers that bypass the React state. Falls back to memory if Redis
// is unavailable; in that case the limit is still enforced per-instance.
const emailOtpResendCooldownLimiter = createRateLimiter({
  name: 'Email OTP Resend Cooldown',
  limit: 1,
  window: '30 s',
  prefix: 'notifications:email-otp:resend-cooldown',
  analytics: true,
});

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
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

  const parsedEmail =
    body && typeof body === 'object' && 'email' in body
      ? normalizeSubscriptionEmail(
          String((body as { email?: string }).email ?? '')
        )
      : null;

  if (parsedEmail) {
    // 30s per-email cooldown is checked first so a flood of resends can't
    // burn the 5/10m budget. We always check the broader limiter too.
    const cooldownResult =
      await emailOtpResendCooldownLimiter.limit(parsedEmail);
    if (!cooldownResult.success) {
      return createRateLimitedResponse(cooldownResult);
    }

    const emailLimitResult = await emailOtpSendLimiter.limit(parsedEmail);
    if (!emailLimitResult.success) {
      return createRateLimitedResponse(emailLimitResult);
    }
  }

  try {
    const result = await subscribeToNotificationsDomain(body, {
      headers: request.headers,
    });

    const response = createNotificationJsonResponse(
      result.body,
      result.status,
      rateLimitResult
    );

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
    await captureError('Notification subscription failed', error, {
      route: '/api/notifications/subscribe',
      method: 'POST',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
