import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { APP_URL, AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import {
  audienceMembers,
  creatorProfiles,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { sendNotification } from '@/lib/notifications/service';

// Resend + DB access requires Node runtime
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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
    city: z.string().min(1).max(120).optional(),
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
    const runtimeStart = Date.now();
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
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { artist_id, email, phone, channel, source, country_code, city } =
      result.data;

    const [artistProfile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        creatorIsPro: users.isPro,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, artist_id))
      .limit(1);

    if (!artistProfile) {
      return NextResponse.json(
        { success: false, error: 'Artist not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const creatorIsPro = Boolean(artistProfile.creatorIsPro);

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const geoCountry =
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      null;

    const geoCity = request.headers.get('x-vercel-ip-city') || null;

    const countryCode =
      (geoCountry || country_code)?.slice(0, 2)?.toUpperCase() || null;

    const cityValue = (city || geoCity)?.trim() || null;

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

    const [insertedSubscription] = await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: artist_id,
        channel,
        email: normalizedEmail,
        phone: channel === 'phone' ? normalizedPhone : null,
        countryCode,
        city: cityValue,
        ipAddress,
        source,
      })
      .onConflictDoNothing({ target: conflictTarget })
      .returning({
        id: notificationSubscriptions.id,
      });

    // Track successful subscription
    await trackServerEvent('notifications_subscribe_success', {
      artist_id,
      channel,
      email_domain: normalizedEmail ? normalizedEmail.split('@')[1] : undefined,
      phone_present: Boolean(normalizedPhone),
      country_code: countryCode ?? undefined,
      source,
      creator_is_pro: creatorIsPro,
    });

    if (creatorIsPro && normalizedEmail) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = request.headers.get('user-agent') || null;
      const fingerprint = createFingerprint(ip, ua);
      const now = new Date();

      await withSystemIngestionSession(async tx => {
        const [existingMember] = await tx
          .select({
            id: audienceMembers.id,
            type: audienceMembers.type,
            email: audienceMembers.email,
          })
          .from(audienceMembers)
          .where(
            and(
              eq(audienceMembers.creatorProfileId, artist_id),
              eq(audienceMembers.fingerprint, fingerprint)
            )
          )
          .limit(1);

        if (existingMember) {
          await tx
            .update(audienceMembers)
            .set({
              type: 'email',
              email: normalizedEmail,
              lastSeenAt: now,
              updatedAt: now,
            })
            .where(eq(audienceMembers.id, existingMember.id));
          return;
        }

        await tx.insert(audienceMembers).values({
          creatorProfileId: artist_id,
          fingerprint,
          type: 'email',
          displayName: 'Subscriber',
          email: normalizedEmail,
          firstSeenAt: now,
          lastSeenAt: now,
          visits: 0,
          engagementScore: 0,
          intentLevel: 'low',
          deviceType: 'unknown',
          referrerHistory: [],
          latestActions: [],
          tags: [],
          createdAt: now,
          updatedAt: now,
        });
      });
    }

    let dispatchResult: Awaited<ReturnType<typeof sendNotification>> | null =
      null;

    if (channel === 'email' && normalizedEmail && insertedSubscription?.id) {
      const profileUrl = `${APP_URL.replace(/\/$/, '')}/${artistProfile.username}`;
      const artistName =
        artistProfile.displayName || artistProfile.username || 'this artist';
      const dedupKey = `notification_subscribe:${artist_id}:${normalizedEmail}`;

      dispatchResult = await sendNotification(
        {
          id: dedupKey,
          dedupKey,
          category: 'transactional',
          subject: `You're subscribed to ${artistName} on Jovie`,
          text: `Thanks for turning on notifications. We'll email you when ${artistName} drops new music.\n\nManage your notification settings anytime: ${profileUrl}/notifications`,
          html: `
            <p>Thanks for turning on notifications for <strong>${artistName}</strong>.</p>
            <p>We'll email you when ${artistName} drops new music or updates their profile.</p>
            <p style="margin:16px 0;">
              <a href="${profileUrl}/notifications" style="padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Manage notifications</a>
            </p>
            <p style="font-size:14px;color:#555;">If you didn't request this, you can ignore this email or unsubscribe from the artist page.</p>
          `,
          channels: ['email'],
          respectUserPreferences: false,
          dismissible: true,
        },
        {
          email: normalizedEmail,
          creatorProfileId: artist_id,
        }
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Subscription successful',
        email_dispatched: dispatchResult?.delivered.includes('email') ?? false,
        duration_ms: Math.round(Date.now() - runtimeStart),
      },
      { headers: NO_STORE_HEADERS }
    );

    if (creatorIsPro) {
      response.cookies.set(AUDIENCE_IDENTIFIED_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      });
    }

    return response;
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
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
