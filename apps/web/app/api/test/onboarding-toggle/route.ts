import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { creatorProfiles, users } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ToggleState = 'complete' | 'reset';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'test') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const url = new URL(request.url);
  const state = url.searchParams.get('state') as ToggleState | null;

  if (state !== 'complete' && state !== 'reset') {
    return NextResponse.json(
      { ok: false, error: 'Invalid state' },
      { status: 400 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  const result = await withDbSessionTx(
    async tx => {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, userId))
        .limit(1);

      const dbUserId =
        existingUser?.id ??
        (await tx
          .insert(users)
          .values({
            clerkId: userId,
            email,
            status: 'active',
            userStatus: 'active',
          })
          .onConflictDoUpdate({
            target: users.clerkId,
            set: { email, updatedAt: new Date() },
          })
          .returning({ id: users.id })
          .then(rows => rows[0]?.id ?? null));

      if (!dbUserId) {
        return { success: false as const, error: 'Failed to resolve DB user' };
      }

      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, dbUserId))
        .limit(1);

      const profileId =
        profile?.id ??
        (await tx
          .insert(creatorProfiles)
          .values({
            userId: dbUserId,
            creatorType: 'artist',
            username: `e2e-${userId}`,
            usernameNormalized: `e2e-${userId}`.toLowerCase(),
            displayName: 'E2E User',
            isPublic: true,
            isClaimed: true,
          })
          .returning({ id: creatorProfiles.id })
          .then(rows => rows[0]?.id ?? null));

      if (!profileId) {
        return {
          success: false as const,
          error: 'Failed to create creator profile',
        };
      }

      const nextValue = state === 'complete' ? new Date() : null;

      const [updated] = await tx
        .update(creatorProfiles)
        .set({ onboardingCompletedAt: nextValue, updatedAt: new Date() })
        .where(eq(creatorProfiles.id, profileId))
        .returning({
          onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
        });

      return {
        success: true as const,
        onboardingCompletedAt: updated?.onboardingCompletedAt ?? null,
      };
    },
    { clerkUserId: userId, isolationLevel: 'serializable' }
  );

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        state,
        onboardingCompletedAt: null,
        error: result.error,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    state,
    onboardingCompletedAt: result.onboardingCompletedAt
      ? result.onboardingCompletedAt.toISOString()
      : null,
  });
}
