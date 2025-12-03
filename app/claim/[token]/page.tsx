import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';

interface ClaimPageProps {
  params: {
    token: string;
  };
}

export const runtime = 'nodejs';

export default async function ClaimPage({ params }: ClaimPageProps) {
  const token = params.token;

  if (!token) {
    redirect('/');
  }

  const { userId } = await auth();

  if (!userId) {
    const redirectTarget = `/claim/${encodeURIComponent(token)}`;
    redirect(`/sign-in?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  // Look up profile by claim token
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.claimToken, token))
    .limit(1);

  if (!profile) {
    // Invalid or expired token – send user to dashboard
    redirect('/dashboard');
  }

  // If already claimed, just send the user to their dashboard
  if (profile.isClaimed || profile.userId) {
    redirect('/dashboard/overview');
  }

  // Ensure a corresponding users row exists for this Clerk user
  let dbUserId = profile.userId;

  if (!dbUserId) {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (existingUser?.id) {
      dbUserId = existingUser.id;
    } else {
      const [createdUser] = await db
        .insert(users)
        .values({
          clerkId: userId,
          email: null,
        })
        .returning({ id: users.id });

      dbUserId = createdUser.id;
    }
  }

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      userId: dbUserId,
      isClaimed: true,
      claimToken: null,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profile.id))
    .returning({
      usernameNormalized: creatorProfiles.usernameNormalized,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    });

  const usernameNormalized =
    updatedProfile?.usernameNormalized ?? profile.usernameNormalized;
  const needsOnboarding = !updatedProfile?.onboardingCompletedAt;

  if (needsOnboarding) {
    redirect(`/onboarding?handle=${encodeURIComponent(usernameNormalized)}`);
  }

  redirect('/dashboard/overview');
}
