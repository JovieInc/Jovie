/**
 * POST /api/admin/set-plan
 *
 * Admin-only endpoint to set the current user's plan directly in the database.
 * Works in all environments (including production) for admin users.
 * Used by the AdminPlanToggle dev bar component.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { updateUserBillingStatus } from '@/lib/stripe/customer-sync';

const RequestSchema = z.object({
  plan: z.enum(['free', 'pro', 'max']),
});

export async function POST(req: Request) {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const { userId } = await getCachedAuth({ session: 'fresh' });
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

  // Same writer as the webhook: bumps billingVersion (so a concurrent webhook
  // conflicts instead of overwriting) and writes the audit row.
  const audit = {
    clerkUserId: userId,
    eventType: 'admin_override',
    source: 'manual',
    metadata: { reason: 'dev_toolbar_set_plan', plan },
  } as const;
  const result = await updateUserBillingStatus(
    isPro ? { ...audit, isPro, plan } : { ...audit, isPro, plan: 'free' }
  );
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, plan, isPro });
}
