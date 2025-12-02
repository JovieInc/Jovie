import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema';

// Schema for subscription request validation
const subscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'phone']).default('email'),
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,20}$/, 'Please provide a valid phone number')
      .optional(),
    country_code: z.string().min(2).max(2).optional(),
    source: z.string().default('profile_bell'),
  })
  .refine(
    data =>
      (data.channel === 'email' && Boolean(data.email)) ||
      (data.channel === 'phone' && Boolean(data.phone)),
    {
      message: 'Email or phone is required for the selected channel',
      path: ['channel'],
    }
  );

/**
 * POST handler for notification subscriptions
 * Implements server-side analytics tracking for subscription events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const result = subscribeSchema.safeParse(body);

    // Track subscription attempt with analytics
    await trackServerEvent('notifications_subscribe_attempt', {
      artist_id: body.artist_id,
      channel: body.channel || 'email',
      email_length: body.email?.length || 0,
      phone_length: body.phone?.length || 0,
      source: body.source || 'unknown',
    });

    // If validation fails, return error
    if (!result.success) {
      // Track validation error
      await trackServerEvent('notifications_subscribe_error', {
        artist_id: body.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        source: body.source || 'unknown',
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

    const { artist_id, email, phone, channel, source, country_code } =
      result.data;

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const geoCountry =
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      null;

    const countryCode =
      (geoCountry || country_code)?.slice(0, 2)?.toUpperCase() || null;

    const normalizedEmail =
      channel === 'email' && email ? email.trim().toLowerCase() : null;

    const normalizedPhone =
      channel === 'phone' && phone ? phone.replace(/[\s-]/g, '') : null;

    const conflictTarget =
      channel === 'email'
        ? [
            notificationSubscriptions.creatorProfileId,
            notificationSubscriptions.email,
          ]
        : [
            notificationSubscriptions.creatorProfileId,
            notificationSubscriptions.phone,
          ];

    await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: artist_id,
        channel,
        email: normalizedEmail,
        phone: channel === 'phone' ? normalizedPhone : null,
        countryCode,
        ipAddress,
        source,
      })
      .onConflictDoNothing({ target: conflictTarget });

    // Track successful subscription
    await trackServerEvent('notifications_subscribe_success', {
      artist_id,
      channel,
      email_domain: normalizedEmail ? normalizedEmail.split('@')[1] : undefined,
      phone_present: Boolean(normalizedPhone),
      country_code: countryCode ?? undefined,
      source,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription successful',
    });
  } catch (error) {
    // Track unexpected error
    await trackServerEvent('notifications_subscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    console.error('[Notifications Subscribe] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500 }
    );
  }
}
