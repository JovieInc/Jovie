import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { updateSubscriberNameSchema } from '@/lib/validation/schemas/notifications';
import {
  createNotificationJsonResponse,
  createRateLimitedResponse,
  createServerErrorResponse,
} from '../route-helpers';

export const runtime = 'nodejs';

/**
 * Strip HTML tags from a string to prevent stored XSS.
 */
function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * PATCH handler for updating a subscriber's name after signup.
 * Identified by email + artist_id (no auth required — fan just subscribed).
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
    return createNotificationJsonResponse(
      { success: false, error: 'Invalid request body' },
      400,
      rateLimitResult
    );
  }

  const parsed = updateSubscriberNameSchema.safeParse(body);
  if (!parsed.success) {
    return createNotificationJsonResponse(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid input',
      },
      400,
      rateLimitResult
    );
  }

  const { artist_id, email, name } = parsed.data;
  const sanitizedName = stripHtmlTags(name).trim();

  if (!sanitizedName) {
    return createNotificationJsonResponse(
      { success: false, error: 'Name is required' },
      400,
      rateLimitResult
    );
  }

  try {
    const result = await db
      .update(notificationSubscriptions)
      .set({ name: sanitizedName })
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, artist_id),
          eq(notificationSubscriptions.email, email)
        )
      )
      .returning({ id: notificationSubscriptions.id });

    if (result.length === 0) {
      logger.warn('[Update Name] Subscription not found', {
        artist_id,
        email,
      });
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
    logger.error('[Update Name] Error:', error);
    await captureError('Subscriber name update failed', error, {
      route: '/api/notifications/update-name',
      method: 'PATCH',
    });
    return createServerErrorResponse(rateLimitResult);
  }
}
