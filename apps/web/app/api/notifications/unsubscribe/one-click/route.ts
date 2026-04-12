/**
 * RFC 8058 One-Click Unsubscribe Endpoint
 *
 * Receives POST requests from email clients (Gmail, Outlook) when users click
 * the unsubscribe button in the email UI. The token in the URL query param
 * encodes subscriberId + email, HMAC-signed.
 *
 * Body: List-Unsubscribe=One-Click (per RFC 8058)
 * Query: ?token=<signed-token>
 *
 * Sets unsubscribedAt instead of deleting the row (soft delete for compliance).
 */

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { notificationSubscriptions } from '@/lib/db/schema/analytics';
import { verifyOneClickUnsubscribeToken } from '@/lib/email/one-click-unsubscribe-token';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const decoded = verifyOneClickUnsubscribeToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    const { subscriberId, email } = decoded;

    // Soft delete: set unsubscribedAt instead of deleting
    const result = await db
      .update(notificationSubscriptions)
      .set({ unsubscribedAt: new Date() })
      .where(
        and(
          eq(notificationSubscriptions.id, subscriberId),
          eq(notificationSubscriptions.email, email)
        )
      )
      .returning({ id: notificationSubscriptions.id });

    if (result.length === 0) {
      logger.warn('One-click unsubscribe: subscription not found', {
        subscriberId,
      });
    }

    // RFC 8058 requires 200 OK regardless of whether the subscription existed
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('One-click unsubscribe failed', { error });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
