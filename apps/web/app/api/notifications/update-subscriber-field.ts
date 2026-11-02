import { and, eq, gte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  SUBSCRIPTION_MANAGEMENT_COOKIE,
  verifySubscriptionManagementToken,
} from '@/lib/notifications/management-token';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  createNotificationJsonResponse,
  createRateLimitedResponse,
  createServerErrorResponse,
} from './route-helpers';

/**
 * Field updates also stay limited to 5 minutes after subscription creation,
 * on top of the signup-session token.
 */
const UPDATE_WINDOW_MS = 5 * 60 * 1000;

interface FieldUpdateOptions {
  readonly schema: ZodType;
  readonly fieldName: string;
  readonly extractField: (
    data: Record<string, string>
  ) => Record<string, string>;
  readonly sanitize?: (value: string) => string | null;
  readonly logPrefix: string;
  readonly route: string;
  readonly errorMessage: string;
}

export async function handleSubscriberFieldUpdate(
  request: NextRequest,
  options: FieldUpdateOptions
) {
  const clientIp = getClientIP(request);
  const rateLimitResult = await generalLimiter.limit(clientIp);

  if (!rateLimitResult.success) {
    return createRateLimitedResponse(rateLimitResult);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createNotificationJsonResponse(
      { success: false, error: 'Invalid request body' },
      400,
      rateLimitResult
    );
  }

  const parsed = options.schema.safeParse(body);
  if (!parsed.success) {
    const zodError = parsed.error as { issues?: { message?: string }[] };
    return createNotificationJsonResponse(
      {
        success: false,
        error: zodError.issues?.[0]?.message ?? 'Invalid input',
      },
      400,
      rateLimitResult
    );
  }

  const data = parsed.data as Record<string, string>;
  const { artist_id } = data;
  const email = normalizeSubscriptionEmail(data.email);

  // Holding an address is not proof of owning the subscription. The signed
  // cookie is issued only when the signup proved mailbox control (email OTP),
  // bound to this (artist, email) pair.
  const sessionToken = request.cookies.get(
    SUBSCRIPTION_MANAGEMENT_COOKIE
  )?.value;
  if (
    !email ||
    !verifySubscriptionManagementToken(sessionToken, artist_id, email)
  ) {
    return createNotificationJsonResponse(
      { success: false, error: 'Verify your email to update your details' },
      403,
      rateLimitResult
    );
  }
  const fieldValues = options.extractField(data);

  if (options.sanitize) {
    for (const key of Object.keys(fieldValues)) {
      const sanitized = options.sanitize(fieldValues[key]);
      if (!sanitized) {
        return createNotificationJsonResponse(
          { success: false, error: `${options.fieldName} is required` },
          400,
          rateLimitResult
        );
      }
      fieldValues[key] = sanitized;
    }
  }

  try {
    const cutoff = new Date(Date.now() - UPDATE_WINDOW_MS);
    const result = await db
      .update(notificationSubscriptions)
      .set(fieldValues)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, artist_id),
          eq(notificationSubscriptions.email, email),
          gte(notificationSubscriptions.createdAt, cutoff)
        )
      )
      .returning({ id: notificationSubscriptions.id });

    if (result.length === 0) {
      logger.warn(
        `[${options.logPrefix}] Subscription not found or outside update window`,
        { artist_id, email }
      );
      return createNotificationJsonResponse(
        { success: false, error: 'Subscription not found' },
        404,
        rateLimitResult
      );
    }

    return createNotificationJsonResponse(
      { success: true },
      200,
      rateLimitResult
    );
  } catch (error) {
    logger.error(`[${options.logPrefix}] Error:`, error);
    await captureError(options.errorMessage, error, {
      route: options.route,
      method: 'PATCH',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
