import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getWaitlistInviteByToken,
  resolveUserState,
  UserState,
} from '@/lib/auth/gate';
import { db } from '@/lib/db';
import { creatorProfiles, users, waitlistEntries } from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';
import { checkRateLimit } from '@/lib/utils/rate-limit';

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

  // Use centralized auth gate for user state resolution
  // Note: createDbUserIfMissing=true ensures user row exists for claim
  const authResult = await resolveUserState({ createDbUserIfMissing: true });

  // Handle unauthenticated users
  if (authResult.state === UserState.UNAUTHENTICATED) {
    const redirectTarget = `/claim/${encodeURIComponent(token)}`;
    const invite = await getWaitlistInviteByToken(token);
    const authPath = invite ? '/signin' : '/signup';
    redirect(`${authPath}?redirect_url=${encodeURIComponent(redirectTarget)}`);
  }

  // Handle banned users
  if (authResult.state === UserState.BANNED) {
    logger.warn('Claim attempt by banned user', {
      clerkId: authResult.clerkUserId,
    });
    redirect('/banned');
  }

  const claimUserKey = `claim:user:${authResult.clerkUserId}`;
  if (checkRateLimit(claimUserKey)) {
    logger.warn('Claim attempt rate limited by user', {
      token: token.slice(0, 8),
      clerkId: authResult.clerkUserId,
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
    redirect('/app/dashboard');
  }

  // Check token expiration
  if (profile.claimTokenExpiresAt && profile.claimTokenExpiresAt < new Date()) {
    logger.warn('Claim token expired', {
      profileId: profile.id,
      expiredAt: profile.claimTokenExpiresAt,
    });
    redirect('/app/dashboard');
  }

  // If already claimed, just send the user to their dashboard
  if (profile.isClaimed || profile.userId) {
    redirect('/app/dashboard');
  }

  // Get or create DB user ID from auth result
  // resolveUserState with createDbUserIfMissing=true ensures dbUserId exists
  let dbUserId = authResult.dbUserId;

  if (!dbUserId) {
    // Defensive check: ensure we have a valid Clerk user ID
    if (!authResult.clerkUserId) {
      logger.error(
        '[CLAIM] Missing clerkUserId in auth result during user creation'
      );
      redirect('/signin');
    }

    // Fallback: create user if somehow missing (shouldn't happen with createDbUserIfMissing=true)
    // User has claimed a profile but hasn't completed onboarding yet
    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId: authResult.clerkUserId,
        email: authResult.context.email,
        userStatus: 'profile_claimed', // They need to complete onboarding
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
    redirect('/app/dashboard');
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
    redirect('/app/dashboard');
  }

  if (waitlistInvite) {
    try {
      // Atomically update both waitlist entry and user approval status
      await db.transaction(async tx => {
        await tx
          .update(waitlistEntries)
          .set({ status: 'claimed', updatedAt: now })
          .where(
            and(
              eq(waitlistEntries.id, waitlistInvite.waitlistEntryId),
              eq(waitlistEntries.status, 'invited')
            )
          );

        // Update user status to profile_claimed and link to waitlist entry
        await tx
          .update(users)
          .set({
            userStatus: 'profile_claimed',
            updatedAt: now,
          })
          .where(eq(users.id, dbUserId));
      });
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

  redirect('/app/dashboard');
}
