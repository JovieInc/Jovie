import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationSubscriptionState,
} from '@/types/notifications';

const statusSchema = z
  .object({
    artist_id: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,20}$/, 'Please provide a valid phone number')
      .optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  );

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = statusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: result.error.format(),
        },
        { status: 400 }
      );
    }

    const { artist_id, email, phone } = result.data;
    const normalizedEmail = email?.trim().toLowerCase() ?? null;
    const normalizedPhone = phone ? phone.replace(/[\s-]/g, '') : null;

    const channels: NotificationSubscriptionState = {};
    const details: NotificationContactValues = {};

    const lookups: Array<{
      channel: NotificationChannel;
      value: string | null;
    }> = [
      { channel: 'email', value: normalizedEmail },
      { channel: 'phone', value: normalizedPhone },
    ];

    for (const lookup of lookups) {
      if (!lookup.value) continue;

      const rows = await db
        .select({
          id: notificationSubscriptions.id,
          value:
            lookup.channel === 'email'
              ? notificationSubscriptions.email
              : notificationSubscriptions.phone,
        })
        .from(notificationSubscriptions)
        .where(
          and(
            eq(notificationSubscriptions.creatorProfileId, artist_id),
            eq(notificationSubscriptions.channel, lookup.channel),
            eq(
              lookup.channel === 'email'
                ? notificationSubscriptions.email
                : notificationSubscriptions.phone,
              lookup.value
            )
          )
        )
        .limit(1);

      if (rows.length > 0) {
        channels[lookup.channel] = true;
        details[lookup.channel] = lookup.value;
      }
    }

    return NextResponse.json({
      success: true,
      channels,
      details,
    });
  } catch (error) {
    console.error('[Notifications Status] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500 }
    );
  }
}
