/**
 * Growth Plan Early Access Request API
 *
 * Allows authenticated users to request early access to the Growth plan.
 * Stores the request on the user record and sends a Slack notification.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { notifySlackGrowthRequest } from '@/lib/notifications/providers/slack';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Please tell us what feature excites you most' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (reason.length > 2000) {
      return NextResponse.json(
        { error: 'Response is too long (max 2000 characters)' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Look up the user
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        plan: users.plan,
        growthAccessRequestedAt: users.growthAccessRequestedAt,
      })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Check if already on Growth plan
    if (user.plan === 'growth') {
      return NextResponse.json(
        { error: 'You already have the Growth plan' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Check if already requested
    if (user.growthAccessRequestedAt) {
      return NextResponse.json(
        { error: 'You have already requested Growth access' },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }

    // Store the request
    await db
      .update(users)
      .set({
        growthAccessRequestedAt: new Date(),
        growthAccessReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, userId));

    // Send Slack notification (fire and forget)
    notifySlackGrowthRequest(
      user.name ?? 'Unknown',
      user.email ?? 'No email',
      user.plan ?? 'free',
      reason.trim()
    ).catch(err => {
      logger.error('[growth-access] Failed to send Slack notification', err);
    });

    logger.info('[growth-access] Request submitted', {
      userId: user.id,
      plan: user.plan,
    });

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error('[growth-access] Request failed', err);
    return NextResponse.json(
      { error: 'Failed to submit request' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
