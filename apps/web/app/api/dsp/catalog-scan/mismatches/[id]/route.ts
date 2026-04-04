import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { dspCatalogMismatches } from '@/lib/db/schema/dsp-catalog-scan';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const updateMismatchSchema = z.object({
  status: z.enum(['confirmed_mismatch', 'dismissed', 'flagged']),
  reason: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const body = await request.json();
  const parsed = updateMismatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Get the mismatch and verify ownership
  const [mismatch] = await db
    .select({
      id: dspCatalogMismatches.id,
      creatorProfileId: dspCatalogMismatches.creatorProfileId,
    })
    .from(dspCatalogMismatches)
    .where(eq(dspCatalogMismatches.id, id))
    .limit(1);

  if (!mismatch) {
    return NextResponse.json({ error: 'Mismatch not found' }, { status: 404 });
  }

  // Verify the user owns this profile
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(
      and(
        eq(creatorProfiles.id, mismatch.creatorProfileId),
        eq(users.clerkId, userId)
      )
    )
    .limit(1);

  if (!profile) {
    return NextResponse.json(
      { error: 'Not authorized to modify this mismatch' },
      { status: 403 }
    );
  }

  const { status, reason } = parsed.data;

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'dismissed') {
    updateData.dismissedAt = new Date();
    updateData.dismissedReason = reason ?? null;
  } else if (status === 'flagged') {
    // Resetting to flagged clears dismiss data
    updateData.dismissedAt = null;
    updateData.dismissedReason = null;
  }

  const [updated] = await db
    .update(dspCatalogMismatches)
    .set(updateData)
    .where(eq(dspCatalogMismatches.id, id))
    .returning();

  return NextResponse.json({ mismatch: updated });
}
