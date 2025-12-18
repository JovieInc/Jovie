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

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function normalizePhoneToE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/(?!^\+)[^\d]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  normalized = `+${normalized.slice(1).replace(/\D/g, '')}`;

  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

const statusSchema = z
  .object({
    artist_id: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  );

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = statusSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { artist_id, email, phone } = result.data;
    const normalizedEmail = email?.trim().toLowerCase() ?? null;
    const normalizedPhone = phone ? normalizePhoneToE164(phone) : null;

    if (phone && !normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid phone number',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const channels: NotificationSubscriptionState = {};
    const details: NotificationContactValues = {};

    const lookups: Array<{
      channel: NotificationChannel;
      value: string | null;
    }> = [
      { channel: 'email', value: normalizedEmail },
      { channel: 'sms', value: normalizedPhone },
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

    return NextResponse.json(
      {
        success: true,
        channels,
        details,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[Notifications Status] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
