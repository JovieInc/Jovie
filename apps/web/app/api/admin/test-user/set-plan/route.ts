/**
 * POST /api/admin/test-user/set-plan
 *
 * Test-only endpoint to set a user's plan directly in the database.
 * Hard-gated: only works in non-production AND for Clerk +clerk_test emails.
 *
 * Used by E2E tests to upgrade/downgrade the test user without going
 * through the full Stripe checkout flow.
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

const RequestSchema = z.object({
  plan: z.enum(['free', 'founding', 'pro', 'growth']),
});

export async function POST(req: Request) {
  // Hard gate: never allow in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify this is a Clerk test user (+clerk_test email)
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

  const { plan } = parsed.data;
  const isPro = plan !== 'free';

  await db
    .update(users)
    .set({
      plan,
      isPro,
      billingUpdatedAt: new Date(),
    })
    .where(eq(users.clerkId, userId));

  return NextResponse.json({ success: true, plan, isPro });
}
