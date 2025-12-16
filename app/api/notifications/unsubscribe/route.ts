import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema';

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

// Schema for unsubscription request validation
const unsubscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'phone']).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
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
    const bodyObject: Record<string, unknown> =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};

    const result = unsubscribeSchema.safeParse(body);

    // Track unsubscription attempt with analytics
    await trackServerEvent('notifications_unsubscribe_attempt', {
      artist_id:
        typeof bodyObject.artist_id === 'string' ? bodyObject.artist_id : null,
      method: typeof bodyObject.method === 'string' ? bodyObject.method : 'api',
      channel:
        typeof bodyObject.channel === 'string'
          ? bodyObject.channel
          : typeof bodyObject.phone === 'string'
            ? 'phone'
            : 'email',
    });

    // If validation fails, return error
    if (!result.success) {
      // Track validation error
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id:
          typeof bodyObject.artist_id === 'string'
            ? bodyObject.artist_id
            : null,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        channel:
          typeof bodyObject.channel === 'string'
            ? bodyObject.channel
            : typeof bodyObject.phone === 'string'
              ? 'phone'
              : 'email',
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
        },
        { status: 400, headers: NO_STORE_HEADERS }
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
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Normalize contact values
    const normalizedEmail = email?.trim().toLowerCase() ?? null;
    const normalizedPhone = phone ? normalizePhoneToE164(phone) : null;

    if (phone && !normalizedPhone) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid phone number'],
        channel: channel || 'phone',
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid phone number',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

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
        { status: 400, headers: NO_STORE_HEADERS }
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

    return NextResponse.json(
      {
        success: true,
        removed: deleted.length,
        message:
          deleted.length > 0
            ? 'Unsubscription successful'
            : 'No matching subscription found',
      },
      { headers: NO_STORE_HEADERS }
    );
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
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
