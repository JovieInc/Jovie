/**
 * POST /api/admin/set-plan
 *
 * Admin-only endpoint to set the current user's plan directly in the database.
 * Works in all environments (including production) for admin users.
 * Used by the AdminPlanToggle dev bar component.
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';

const RequestSchema = z.object({
  plan: z.enum(['free', 'pro', 'max']),
});

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { userId } = await auth();
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
    .where(eq(users.clerkId, userId));

  return NextResponse.json({ success: true, plan, isPro });
}
