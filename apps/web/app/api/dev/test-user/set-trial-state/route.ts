/**
 * POST /api/dev/test-user/set-trial-state
 *
 * Test-only endpoint that mutates the authenticated test user's trial fields
 * to one of the canonical nudgeState shapes. Used to walk through the upgrade
 * nudge UI in dev without waiting 14 calendar days.
 *
 * Hard-gated: non-production AND Clerk +clerk_test emails only.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

const TrialStateSchema = z.enum([
  'never_trialed',
  'trial_honeymoon',
  'trial_late',
  'trial_last_day',
  'recently_lapsed',
  'stale_lapsed',
  'pro_paid',
  'max_paid',
]);

const RequestSchema = z.object({
  state: TrialStateSchema,
  notificationsSent: z.number().int().min(0).max(50).optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

type TrialFields = {
  plan: 'free' | 'trial' | 'pro' | 'max';
  isPro: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialNotificationsSent: number;
};

function fieldsForState(
  state: z.infer<typeof TrialStateSchema>,
  notificationsSent?: number
): TrialFields {
  const now = Date.now();

  switch (state) {
    case 'never_trialed':
      return {
        plan: 'free',
        isPro: false,
        trialStartedAt: null,
        trialEndsAt: null,
        trialNotificationsSent: 0,
      };
    case 'trial_honeymoon':
      return {
        plan: 'trial',
        isPro: false,
        trialStartedAt: new Date(now - 7 * DAY_MS),
        trialEndsAt: new Date(now + 7 * DAY_MS),
        trialNotificationsSent: notificationsSent ?? 5,
      };
    case 'trial_late':
      return {
        plan: 'trial',
        isPro: false,
        trialStartedAt: new Date(now - 12 * DAY_MS),
        trialEndsAt: new Date(now + 2 * DAY_MS),
        trialNotificationsSent: notificationsSent ?? 30,
      };
    case 'trial_last_day':
      return {
        plan: 'trial',
        isPro: false,
        trialStartedAt: new Date(now - 14 * DAY_MS),
        trialEndsAt: new Date(now + 12 * 60 * 60 * 1000),
        trialNotificationsSent: notificationsSent ?? 47,
      };
    case 'recently_lapsed':
      return {
        plan: 'free',
        isPro: false,
        trialStartedAt: new Date(now - 17 * DAY_MS),
        trialEndsAt: new Date(now - 3 * DAY_MS),
        trialNotificationsSent: notificationsSent ?? 32,
      };
    case 'stale_lapsed':
      return {
        plan: 'free',
        isPro: false,
        trialStartedAt: new Date(now - 60 * DAY_MS),
        trialEndsAt: new Date(now - 45 * DAY_MS),
        trialNotificationsSent: notificationsSent ?? 18,
      };
    case 'pro_paid':
      return {
        plan: 'pro',
        isPro: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialNotificationsSent: 0,
      };
    case 'max_paid':
      return {
        plan: 'max',
        isPro: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialNotificationsSent: 0,
      };
  }
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId);
  const primaryEmail = clerkUser.emailAddresses.find(
    e => e.id === clerkUser.primaryEmailAddressId
  )?.emailAddress;

  if (!primaryEmail?.includes('+clerk_test')) {
    return NextResponse.json(
      { error: 'Only available for test users (+clerk_test)' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const fields = fieldsForState(
    parsed.data.state,
    parsed.data.notificationsSent
  );

  await db
    .update(users)
    .set({
      ...fields,
      billingUpdatedAt: new Date(),
    })
    .where(eq(users.clerkId, userId));

  return NextResponse.json({
    success: true,
    state: parsed.data.state,
    fields: {
      plan: fields.plan,
      trialStartedAt: fields.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: fields.trialEndsAt?.toISOString() ?? null,
      trialNotificationsSent: fields.trialNotificationsSent,
    },
  });
}
