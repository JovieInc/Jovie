import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema';

// Schema for unsubscription request validation
const unsubscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'phone']).optional(),
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,20}$/, 'Please provide a valid phone number')
      .optional(),
    token: z.string().optional(),
    method: z
      .enum(['email_link', 'dashboard', 'api', 'dropdown'])
      .default('api'),
  })
  .refine(
    data =>
      Boolean(data.token) ||
      Boolean(data.email) ||
      Boolean(data.phone) ||
      (data.channel === 'email' && Boolean(data.email)) ||
      (data.channel === 'phone' && Boolean(data.phone)),
    {
      message: 'Either email, phone, or token must be provided',
      path: ['channel'],
    }
  );

/**
 * POST handler for notification unsubscriptions
 * Implements server-side analytics tracking for unsubscription events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const result = unsubscribeSchema.safeParse(body);

    // Track unsubscription attempt with analytics
    await trackServerEvent('notifications_unsubscribe_attempt', {
      artist_id: body.artist_id,
      method: body.method || 'api',
      channel: body.channel || (body.phone ? 'phone' : 'email'),
    });

    // If validation fails, return error
    if (!result.success) {
      // Track validation error
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id: body.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        channel: body.channel || (body.phone ? 'phone' : 'email'),
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { artist_id, email, phone, token, method, channel } = result.data;

    // Ensure at least one identifier is provided
    if (!email && !phone && !token) {
      // Track error - missing identifiers
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: channel || (phone ? 'phone' : 'email'),
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Either email, phone, or token must be provided',
        },
        { status: 400 }
      );
    }

    // Normalize contact values
    const normalizedEmail = email?.trim().toLowerCase() ?? null;
    const normalizedPhone = phone ? phone.replace(/[\s-]/g, '') : null;

    const targetChannel: 'email' | 'phone' =
      channel || (normalizedPhone ? 'phone' : 'email');

    if (!normalizedEmail && !normalizedPhone) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: targetChannel,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Contact required to unsubscribe',
        },
        { status: 400 }
      );
    }

    const whereClauses = [
      eq(notificationSubscriptions.creatorProfileId, artist_id),
    ];

    if (targetChannel === 'email' && normalizedEmail) {
      whereClauses.push(eq(notificationSubscriptions.email, normalizedEmail));
      whereClauses.push(eq(notificationSubscriptions.channel, 'email'));
    } else if (targetChannel === 'phone' && normalizedPhone) {
      whereClauses.push(eq(notificationSubscriptions.phone, normalizedPhone));
      whereClauses.push(eq(notificationSubscriptions.channel, 'phone'));
    }

    const deleted = await db
      .delete(notificationSubscriptions)
      .where(and(...whereClauses))
      .returning({ id: notificationSubscriptions.id });

    // Track successful unsubscription
    await trackServerEvent('notifications_unsubscribe_success', {
      artist_id,
      method,
      channel: targetChannel,
    });

    return NextResponse.json({
      success: true,
      removed: deleted.length,
      message:
        deleted.length > 0
          ? 'Unsubscription successful'
          : 'No matching subscription found',
    });
  } catch (error) {
    // Track unexpected error
    await trackServerEvent('notifications_unsubscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    console.error('[Notifications Unsubscribe] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500 }
    );
  }
}
