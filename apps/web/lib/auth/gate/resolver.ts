/**
 * User state resolution - the core auth gate logic
 */

'server only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { getCachedAuth, getCachedCurrentUser } from '../cached';
import type {
  AuthGateContext,
  AuthGateResult,
  ResolveUserStateOptions,
} from './types';
import { UserState } from './types';
import { isProfileComplete } from './validators';
import { checkWaitlistAccess } from './waitlist';

/**
 * Creates an empty/unauthenticated result
 */
function createEmptyResult(): AuthGateResult {
  return {
    state: UserState.UNAUTHENTICATED,
    clerkUserId: null,
    dbUserId: null,
    profileId: null,
    redirectTo: '/signin',
    context: {
      isAdmin: false,
      isPro: false,
      email: null,
    },
  };
}

/**
 * Creates a result with the given state and context
 */
function createResult(
  state: UserState,
  clerkUserId: string,
  dbUserId: string | null,
  profileId: string | null,
  redirectTo: string | null,
  context: AuthGateContext
): AuthGateResult {
  return { state, clerkUserId, dbUserId, profileId, redirectTo, context };
}

/**
 * Centralized auth gate function that resolves the current user's state.
 *
 * This is the single source of truth for auth state resolution. It replaces
 * scattered auth checks in layout.tsx, onboarding/page.tsx, and claim/[token]/page.tsx.
 *
 * Resolution order:
 * 1. Check Clerk authentication → UNAUTHENTICATED
 * 2. Check DB user existence → NEEDS_DB_USER (auto-creates)
 * 3. Check user status → BANNED
 * 4. Check waitlist/profile state → WAITLIST_*, NEEDS_ONBOARDING, ACTIVE
 */
export async function resolveUserState(
  options?: ResolveUserStateOptions
): Promise<AuthGateResult> {
  const { createDbUserIfMissing = true, claimToken } = options ?? {};

  // 1. Check Clerk authentication
  const { userId: clerkUserId } = await getCachedAuth();
  if (!clerkUserId) {
    return createEmptyResult();
  }

  // Get email from Clerk user
  const clerkUser = await getCachedCurrentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? null;

  // 2. Query DB user by clerk_id
  const [dbUser] = await db
    .select({
      id: users.id,
      status: users.status,
      isAdmin: users.isAdmin,
      isPro: users.isPro,
      deletedAt: users.deletedAt,
      waitlistEntryId: users.waitlistEntryId,
    })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  const baseContext: AuthGateContext = {
    isAdmin: dbUser?.isAdmin ?? false,
    isPro: dbUser?.isPro ?? false,
    email,
  };

  // Handle soft-deleted users
  if (dbUser?.deletedAt) {
    return createResult(
      UserState.BANNED,
      clerkUserId,
      dbUser.id,
      null,
      '/banned',
      baseContext
    );
  }

  // Handle explicitly banned users
  if (dbUser?.status === 'banned') {
    return createResult(
      UserState.BANNED,
      clerkUserId,
      dbUser.id,
      null,
      '/banned',
      baseContext
    );
  }

  // 2b. If no DB user exists, create one if requested
  let dbUserId = dbUser?.id ?? null;

  if (!dbUserId) {
    const result = await handleMissingDbUser(
      clerkUserId,
      email,
      createDbUserIfMissing,
      baseContext
    );
    if (result.shouldReturn) {
      return result.authGateResult;
    }
    dbUserId = result.dbUserId;
  }

  // 3. Check waitlist access for existing users without waitlist linkage
  if (!dbUser?.waitlistEntryId && email) {
    const waitlistResult = await checkExistingUserWaitlist(
      clerkUserId,
      dbUserId!,
      email,
      baseContext
    );
    if (waitlistResult) {
      return waitlistResult;
    }
  }

  // 4. Query creator profile
  const profile = await getCreatorProfile(dbUserId!);

  // No profile or incomplete profile
  if (!profile) {
    return createResult(
      UserState.NEEDS_ONBOARDING,
      clerkUserId,
      dbUserId,
      null,
      '/onboarding',
      { ...baseContext, email, claimToken }
    );
  }

  // Profile exists but is incomplete
  if (!isProfileComplete(profile)) {
    return createResult(
      UserState.NEEDS_ONBOARDING,
      clerkUserId,
      dbUserId,
      profile.id,
      '/onboarding',
      { ...baseContext, email }
    );
  }

  // 5. Fully active user
  return createResult(
    UserState.ACTIVE,
    clerkUserId,
    dbUserId,
    profile.id,
    null,
    {
      isAdmin: dbUser?.isAdmin ?? false,
      isPro: dbUser?.isPro ?? false,
      email,
    }
  );
}

/**
 * Handle the case where no DB user exists
 */
async function handleMissingDbUser(
  clerkUserId: string,
  email: string | null,
  createDbUserIfMissing: boolean,
  baseContext: AuthGateContext
): Promise<
  | { shouldReturn: true; authGateResult: AuthGateResult; dbUserId: null }
  | { shouldReturn: false; authGateResult: null; dbUserId: string }
> {
  if (createDbUserIfMissing && email) {
    // Check waitlist status before creating user
    const waitlistResult = await checkWaitlistAccess(email);

    if (
      waitlistResult.status === 'new' ||
      waitlistResult.status === 'rejected' ||
      !waitlistResult.status
    ) {
      return {
        shouldReturn: true,
        authGateResult: createResult(
          UserState.NEEDS_WAITLIST_SUBMISSION,
          clerkUserId,
          null,
          null,
          '/waitlist',
          { ...baseContext, email }
        ),
        dbUserId: null,
      };
    }

    if (waitlistResult.status === 'invited' && waitlistResult.claimToken) {
      return {
        shouldReturn: true,
        authGateResult: createResult(
          UserState.WAITLIST_INVITED,
          clerkUserId,
          null,
          null,
          `/claim/${encodeURIComponent(waitlistResult.claimToken)}`,
          { ...baseContext, email, claimToken: waitlistResult.claimToken }
        ),
        dbUserId: null,
      };
    }

    // User is claimed or approved - create DB user
    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId: clerkUserId,
        email,
        status: 'active',
        waitlistEntryId: waitlistResult.entryId ?? undefined,
      })
      .returning({ id: users.id });

    return {
      shouldReturn: false,
      authGateResult: null,
      dbUserId: createdUser.id,
    };
  }

  if (!createDbUserIfMissing) {
    return {
      shouldReturn: true,
      authGateResult: createResult(
        UserState.NEEDS_DB_USER,
        clerkUserId,
        null,
        null,
        '/onboarding',
        { ...baseContext, email }
      ),
      dbUserId: null,
    };
  }

  // No email available - send to waitlist
  return {
    shouldReturn: true,
    authGateResult: createResult(
      UserState.NEEDS_WAITLIST_SUBMISSION,
      clerkUserId,
      null,
      null,
      '/waitlist',
      baseContext
    ),
    dbUserId: null,
  };
}

/**
 * Check waitlist for existing users without waitlist linkage
 */
async function checkExistingUserWaitlist(
  clerkUserId: string,
  dbUserId: string,
  email: string,
  baseContext: AuthGateContext
): Promise<AuthGateResult | null> {
  const waitlistResult = await checkWaitlistAccess(email);

  if (waitlistResult.status === 'new') {
    return createResult(
      UserState.WAITLIST_PENDING,
      clerkUserId,
      dbUserId,
      null,
      '/waitlist',
      { ...baseContext, email }
    );
  }

  if (waitlistResult.status === 'rejected') {
    return createResult(
      UserState.NEEDS_WAITLIST_SUBMISSION,
      clerkUserId,
      dbUserId,
      null,
      '/waitlist',
      { ...baseContext, email }
    );
  }

  if (waitlistResult.status === 'invited' && waitlistResult.claimToken) {
    return createResult(
      UserState.WAITLIST_INVITED,
      clerkUserId,
      dbUserId,
      null,
      `/claim/${encodeURIComponent(waitlistResult.claimToken)}`,
      { ...baseContext, email, claimToken: waitlistResult.claimToken }
    );
  }

  return null;
}

/**
 * Get the claimed creator profile for a user
 */
async function getCreatorProfile(dbUserId: string) {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      isPublic: creatorProfiles.isPublic,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.userId, dbUserId),
        eq(creatorProfiles.isClaimed, true)
      )
    )
    .limit(1);

  return profile ?? null;
}
