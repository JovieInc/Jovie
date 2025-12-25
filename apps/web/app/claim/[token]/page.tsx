import { auth } from '@clerk/nextjs/server';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { creatorProfiles, users, waitlistEntries } from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { getWaitlistInviteByToken } from '@/lib/waitlist/access';

interface ClaimPageProps {
  params: {
    token: string;
  };
}

export const runtime = 'nodejs';

const CLAIM_TOKEN_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claim page for creator profiles.
 *
 * Hardening:
 * - Atomic update with WHERE clause to prevent double-claim race conditions
 * - Token expiration check
 * - Multi-profile guard (1 user : 1 profile by default)
 * - Soft-deleted user check
 * - Audit columns (IP, user agent)
 */
export default async function ClaimPage({ params }: ClaimPageProps) {
  const token = params.token;

  if (!token) {
    redirect('/');
  }

  if (!CLAIM_TOKEN_UUID_REGEX.test(token)) {
    logger.warn('Claim attempt with malformed token', {
      token: token.slice(0, 8),
    });
    redirect('/');
  }

  // Get request headers for audit
  const headersList = await headers();
  const claimedFromIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    null;
  const claimedUserAgent = headersList.get('user-agent') || null;

  const claimIp = claimedFromIp ?? 'unknown';
  const claimIpKey = `claim:ip:${claimIp}`;
  const claimTokenKey = `claim:token:${token}`;

  if (checkRateLimit(claimIpKey) || checkRateLimit(claimTokenKey)) {
    logger.warn('Claim attempt rate limited', {
      token: token.slice(0, 8),
      ip: claimIp,
    });
    redirect('/');
  }

  const { userId } = await auth();

  if (!userId) {
    const redirectTarget = `/claim/${encodeURIComponent(token)}`;
    const invite = await getWaitlistInviteByToken(token);
    const authPath = invite ? '/signin' : '/signup';
    redirect(`${authPath}?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  const claimUserKey = `claim:user:${userId}`;
  if (checkRateLimit(claimUserKey)) {
    logger.warn('Claim attempt rate limited by user', {
      token: token.slice(0, 8),
      clerkId: userId,
    });
    redirect('/');
  }

  // Look up profile by claim token
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.claimToken, token))
    .limit(1);

  if (!profile) {
    // Invalid or expired token – send user to dashboard
    logger.warn('Claim attempt with invalid token', {
      token: token.slice(0, 8),
    });
    redirect('/app/dashboard/overview');
  }

  // Check token expiration
  if (profile.claimTokenExpiresAt && profile.claimTokenExpiresAt < new Date()) {
    logger.warn('Claim token expired', {
      profileId: profile.id,
      expiredAt: profile.claimTokenExpiresAt,
    });
    redirect('/app/dashboard/overview');
  }

  // If already claimed, just send the user to their dashboard
  if (profile.isClaimed || profile.userId) {
    redirect('/app/dashboard/overview');
  }

  // Ensure a corresponding users row exists for this Clerk user
  let dbUserId: string | null = null;

  const [existingUser] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  if (existingUser) {
    // Check if user is soft-deleted
    if (existingUser.deletedAt) {
      logger.warn('Claim attempt by soft-deleted user', {
        clerkId: userId,
        deletedAt: existingUser.deletedAt,
      });
      redirect('/app/dashboard/overview');
    }
    dbUserId = existingUser.id;
  } else {
    // Create new user
    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId: userId,
        email: null,
      })
      .returning({ id: users.id });

    dbUserId = createdUser.id;
  }

  // Multi-profile guard: check if user already owns a claimed profile
  // Default policy: 1 user ↔ 1 profile
  const [existingClaimedProfile] = await db
    .select({ id: creatorProfiles.id, username: creatorProfiles.username })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, dbUserId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  if (existingClaimedProfile) {
    logger.info('Claim attempt for profile already owned', {
      profileId: profile.id,
      userId: dbUserId,
      attemptedProfileId: profile.id,
    });
    // Redirect to their existing profile's dashboard
    redirect('/app/dashboard/overview');
  }

  // Atomic claim update with race-safe WHERE clause
  // Only updates if: token matches AND not already claimed AND token not expired
  const now = new Date();

  const waitlistInvite = await getWaitlistInviteByToken(token);

  const [updatedProfile] = await db
    .update(creatorProfiles)
    .set({
      userId: dbUserId,
      isClaimed: true,
      claimToken: null,
      claimedAt: now,
      claimedFromIp,
      claimedUserAgent,
      updatedAt: now,
    })
    .where(
      and(
        eq(creatorProfiles.id, profile.id),
        eq(creatorProfiles.claimToken, token),
        eq(creatorProfiles.isClaimed, false),
        isNull(creatorProfiles.userId),
        or(
          isNull(creatorProfiles.claimTokenExpiresAt),
          gte(creatorProfiles.claimTokenExpiresAt, now)
        )
      )
    )
    .returning({
      id: creatorProfiles.id,
      usernameNormalized: creatorProfiles.usernameNormalized,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    });

  // If no rows updated, someone else claimed it (race condition)
  if (!updatedProfile) {
    logger.error('Profile claim update failed (likely already claimed)', {
      profileId: profile.id,
      userId: dbUserId,
    });
    redirect('/app/dashboard/overview');
  }

  if (waitlistInvite) {
    try {
      await db
        .update(waitlistEntries)
        .set({ status: 'claimed', updatedAt: now })
        .where(
          and(
            eq(waitlistEntries.id, waitlistInvite.waitlistEntryId),
            eq(waitlistEntries.status, 'invited')
          )
        );
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Failed to update waitlist entry status after claim', {
          error,
          waitlistEntryId: waitlistInvite.waitlistEntryId,
        });
      }
    }
  }

  logger.info('Profile claimed successfully', {
    profileId: updatedProfile.id,
    userId: dbUserId,
    handle: updatedProfile.usernameNormalized,
  });

  const usernameNormalized = updatedProfile.usernameNormalized;
  const needsOnboarding = !updatedProfile.onboardingCompletedAt;

  if (needsOnboarding) {
    redirect(`/onboarding?handle=${encodeURIComponent(usernameNormalized)}`);
  }

  redirect('/app/dashboard/overview');
}
