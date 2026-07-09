/**
 * POST /api/dev/test-user/set-plan
 *
 * Test-only endpoint to set the authenticated test user's plan directly.
 * Hard-gated: only works in non-production AND for Clerk +clerk_test emails.
 *
 * Used by E2E tests to upgrade/downgrade the test user without going
 * through the full Stripe checkout flow.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  developmentOnlyForbiddenJson,
  isExplicitDevelopmentEnvironment,
} from '@/lib/security/development-only';

const RequestSchema = z.object({
  plan: z.enum(['free', 'founding', 'pro', 'max']),
});

export async function POST(req: Request) {
  if (!isExplicitDevelopmentEnvironment()) {
    return developmentOnlyForbiddenJson();
  }

  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    .where(eq(users.id, userId));

  return NextResponse.json({ success: true, plan, isPro });
}
