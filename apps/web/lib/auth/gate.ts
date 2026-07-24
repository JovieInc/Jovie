import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';
import { auth } from '@/lib/auth/better-auth';
import { db } from '@/lib/db';
import {
  getDeepErrorMessage,
  isUniqueViolation,
  unwrapPgError,
} from '@/lib/db/errors';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { waitlistEntries } from '@/lib/db/schema/waitlist';
import { captureCriticalError, captureError } from '@/lib/error-tracking';
import { normalizeEmail } from '@/lib/utils/email';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';
import {
  type WaitlistStatus as CanonicalWaitlistStatus,
  isWaitlistApprovedStatus,
  isWaitlistPendingStatus,
} from '@/lib/waitlist/state-machine';
import {
  CanonicalUserState,
  getRedirectForState,
  resolveCanonicalState,
} from './canonical-user-state';
import { getCachedDevTestAuthSession } from './dev-test-auth.server';
import { checkUserStatus } from './status-checker';
import { determineUserStatus, type UserLifecycleStatus } from './user-status';

export type { UserStateInput } from './canonical-user-state';
// Re-export canonical state enum and utilities so consumers can import from gate.ts
// (preserves existing import paths) or directly from canonical-user-state.ts.
export {
  CanonicalUserState,
  canAccessApp,
  canAccessOnboarding,
  getRedirectForState,
  requiresRedirect,
} from './canonical-user-state';

/**
 * Result of resolving user state. Contains all information needed
 * to make auth gating decisions and redirect users appropriately.
 *
 * `clerkUserId` is preserved as the field name for churn reduction; after
 * the Clerk → Better Auth cutover it holds the Better Auth user id
 * (resolved from `auth.api.getSession`). `dbUserId` remains the app
 * `users.id` UUID.
 */
export interface AuthGateResult {
  state: CanonicalUserState;
  clerkUserId: string | null;
  dbUserId: string | null;
  profileId: string | null;
  redirectTo: string | null;
  context: {
    isAdmin: boolean;
    isPro: boolean;
    email: string | null;
    errorCode?: string;
  };
}

function canUseE2ETestAuthFallback(): boolean {
  return (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
    process.env.NEXT_PUBLIC_E2E_MODE === '1' &&
    process.env.VERCEL_ENV !== 'preview'
  );
}

function createE2ETestAuthGateResult(
  clerkUserId: string,
  email: string | null
): AuthGateResult {
  return {
    state: CanonicalUserState.ACTIVE,
    clerkUserId,
    dbUserId: '00000000-0000-4000-8000-000000000101',
    profileId: '00000000-0000-4000-8000-000000000102',
    redirectTo: null,
    context: {
      isAdmin: false,
      isPro: true,
      email: email ?? 'e2e-chat-smoke@example.test',
    },
  };
}

interface AuthGateRecord {
  id: string;
  email: string | null;
  userStatus: string | null;
  isAdmin: boolean | null;
  isPro: boolean | null;
  deletedAt: Date | null;
  profileId: string | null;
  profileUsername: string | null;
  profileUsernameNormalized: string | null;
  profileDisplayName: string | null;
  profileIsPublic: boolean | null;
  profileAvatarUrl: string | null;
  profileOnboardingCompletedAt: Date | null;
}

interface AuthGateDbUser {
  id: string;
  email: string | null;
  userStatus: string | null;
  isAdmin: boolean | null;
  isPro: boolean | null;
  deletedAt: Date | null;
}

interface AuthGateProfile {
  id: string;
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
  isClaimed: true;
}

function createUnauthenticatedAuthGateResult(): AuthGateResult {
  return {
    state: CanonicalUserState.UNAUTHENTICATED,
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
 * Check if an error is a permanent error that should not be retried.
 * Email uniqueness violations are NOT permanent — they're handled by
 * the better_auth_user_id adoption path in createUserWithRetry.
 */
function isPermanentError(error: Error): boolean {
  // Email uniqueness conflicts are recoverable via better_auth_user_id adoption
  if (isUniqueViolation(error, 'users_email_unique')) {
    return false;
  }

  const msg = getDeepErrorMessage(error);
  return msg.includes('duplicate key') || msg.includes('constraint');
}

/**
 * Check if an insert error is an email uniqueness conflict and attempt
 * to adopt the existing row by updating its better_auth_user_id.
 * Returns the adopted user ID, or null if not an email conflict.
 *
 * Post-cutover: the existing row may be a Clerk-era row with clerk_id set
 * and better_auth_user_id null. We adopt it by setting better_auth_user_id
 * to the BA identity, preserving clerk_id as the rollback breadcrumb.
 */
async function tryAdoptExistingUser(
  insertError: unknown,
  email: string | null,
  betterAuthUserId: string,
  userStatus: UserLifecycleStatus
): Promise<string | null> {
  if (!email) return null;
  if (!isUniqueViolation(insertError, 'users_email_unique')) return null;

  const conflictDetail = unwrapPgError(insertError).detail ?? '';
  const conflictingEmail =
    /Key \(email\)=\((.+)\) already exists\./.exec(conflictDetail)?.[1] ??
    normalizeEmail(email);

  const [adopted] = await db
    .update(users)
    .set({
      betterAuthUserId,
      userStatus,
      updatedAt: new Date(),
    })
    .where(eq(users.email, conflictingEmail))
    .returning({ id: users.id });

  return adopted?.id ?? null;
}

/** Build an error summary string from a database error for logging. */
function buildErrorSummary(error: unknown): {
  summary: string;
  dbErrorCode: string | undefined;
  dbConstraint: string | undefined;
  dbDetail: string | undefined;
} {
  const normalizedError =
    error instanceof Error ? error : new Error('Unknown error');
  const pgError = unwrapPgError(error);
  const dbErrorCode = pgError.code ?? undefined;
  const dbConstraint = pgError.constraint ?? undefined;
  const dbDetail = pgError.detail ?? undefined;
  const summary = [
    getDeepErrorMessage(error) || normalizedError.message,
    dbErrorCode && `code=${dbErrorCode}`,
    dbConstraint && `constraint=${dbConstraint}`,
    dbDetail && `detail=${dbDetail}`,
  ]
    .filter(Boolean)
    .join(', ');
  return { summary, dbErrorCode, dbConstraint, dbDetail };
}

/** Upsert a user row, handling email uniqueness conflicts via adoption. */
async function upsertUser(
  betterAuthUserId: string,
  email: string | null,
  userStatus: UserLifecycleStatus,
  waitlistEntryId: string | undefined
): Promise<string> {
  try {
    const [createdUser] = await db
      .insert(users)
      .values({
        betterAuthUserId,
        email,
        userStatus,
        waitlistEntryId,
      })
      .onConflictDoUpdate({
        target: users.betterAuthUserId,
        set: {
          ...(email ? { email } : {}),
          userStatus,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });

    if (createdUser?.id) return createdUser.id;
  } catch (insertError) {
    const adoptedId = await tryAdoptExistingUser(
      insertError,
      email,
      betterAuthUserId,
      userStatus
    );
    if (adoptedId) return adoptedId;
    throw insertError;
  }

  throw new Error('Failed to create or retrieve user');
}

/**
 * Helper function to create a DB user with exponential backoff retry logic.
 *
 * Handles transient database errors that might occur during the Better Auth
 * session propagation window after OAuth callback / OTP verification.
 */
async function createUserWithRetry(
  betterAuthUserId: string,
  email: string | null,
  waitlistEntryId: string | undefined,
  waitlistGateEnabled: boolean,
  maxRetries = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * attempt, 3000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const [existingUserData] = await db
        .select({
          userId: users.id,
          currentStatus: users.userStatus,
          profileId: creatorProfiles.id,
          onboardingComplete: creatorProfiles.onboardingCompletedAt,
        })
        .from(users)
        .leftJoin(
          creatorProfiles,
          eq(creatorProfiles.id, users.activeProfileId)
        )
        .where(eq(users.betterAuthUserId, betterAuthUserId))
        .limit(1);

      const userStatus = determineUserStatus(
        waitlistEntryId,
        existingUserData,
        waitlistGateEnabled
      );
      return await upsertUser(
        betterAuthUserId,
        email,
        userStatus,
        waitlistEntryId
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const { summary, dbErrorCode, dbConstraint, dbDetail } =
        buildErrorSummary(error);
      await captureError(
        `User creation failed (attempt ${attempt + 1}/${maxRetries}): ${summary}`,
        lastError,
        {
          betterAuthUserId,
          email,
          attempt: attempt + 1,
          maxRetries,
          operation: 'createUserWithRetry',
          errorType: lastError.constructor?.name ?? 'unknown',
          dbErrorCode,
          dbConstraint,
          dbDetail,
        }
      );

      if (isPermanentError(lastError)) break;
    }
  }

  const { dbErrorCode } = buildErrorSummary(lastError);
  await captureCriticalError(
    `User creation failed after ${maxRetries} attempts`,
    lastError,
    {
      betterAuthUserId,
      email,
      maxRetries,
      operation: 'createUserWithRetry',
      errorMessage: lastError?.message,
      errorType: lastError?.constructor?.name ?? 'unknown',
      dbErrorCode,
    }
  );
  return null;
}

/** Context for handling missing DB user scenarios */
interface MissingDbUserContext {
  createDbUserIfMissing: boolean;
  betterAuthUserId: string;
  email: string | null;
  baseContext: { isAdmin: boolean; isPro: boolean; email: string | null };
}

/**
 * Handle the case where no DB user exists for an authenticated Better Auth
 * identity. Returns either a complete AuthGateResult (for early return) or
 * the new user ID.
 */
async function handleMissingDbUser(
  ctx: MissingDbUserContext,
  waitlistGateEnabled: boolean
): Promise<AuthGateResult | { dbUserId: string }> {
  const { createDbUserIfMissing, betterAuthUserId, email, baseContext } = ctx;

  // Don't create user - return NEEDS_DB_USER state
  if (!createDbUserIfMissing) {
    return {
      state: CanonicalUserState.NEEDS_DB_USER,
      clerkUserId: betterAuthUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/start?fresh_signup=true',
      context: { ...baseContext, email },
    };
  }

  // Need email to proceed — return a terminal state instead of throwing so
  // cached dashboard reconciliation can fail closed without duplicate Sentry noise.
  if (!email) {
    await captureError(
      'Cannot create user without email',
      new TypeError('Email is required for user creation'),
      { betterAuthUserId, operation: 'resolveUserState' }
    );

    return {
      state: CanonicalUserState.USER_CREATION_FAILED,
      clerkUserId: betterAuthUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/error/user-creation-failed',
      context: {
        ...baseContext,
        email,
        errorCode: 'EMAIL_REQUIRED_FOR_USER_CREATION',
      },
    };
  }

  // Check waitlist status before creating user. When the waitlist gate is
  // OFF, skip the waitlist check entirely — brand-new users are allowed
  // straight through without a waitlist entry. This fixes the blank app
  // shell bug where new signups were redirected to /waitlist even with
  // the gate disabled.
  let waitlistEntryId: string | undefined;

  if (waitlistGateEnabled) {
    const waitlistResult = await checkWaitlistAccessInternal(email);

    if (isWaitlistPendingStatus(waitlistResult.status)) {
      return {
        state: CanonicalUserState.WAITLIST_PENDING,
        clerkUserId: betterAuthUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    if (!waitlistResult.status) {
      return {
        state: CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
        clerkUserId: betterAuthUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    if (!isWaitlistApprovedStatus(waitlistResult.status)) {
      return {
        state: CanonicalUserState.WAITLIST_PENDING,
        clerkUserId: betterAuthUserId,
        dbUserId: null,
        profileId: null,
        redirectTo: '/waitlist',
        context: { ...baseContext, email },
      };
    }

    waitlistEntryId = waitlistResult.entryId ?? undefined;
  }

  // Create the user (without waitlist entry when waitlist is disabled)
  const newUserId = await createUserWithRetry(
    betterAuthUserId,
    email,
    waitlistEntryId,
    waitlistGateEnabled
  );

  if (!newUserId) {
    return {
      state: CanonicalUserState.USER_CREATION_FAILED,
      clerkUserId: betterAuthUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/error/user-creation-failed',
      context: { ...baseContext, email, errorCode: 'USER_CREATION_FAILED' },
    };
  }

  return { dbUserId: newUserId };
}

/**
 * Resolve the current Better Auth identity. Reads `auth.api.getSession`
 * directly (NOT through cached.ts) so gate.ts sees the BA user id — the
 * app `users` lookup then goes through `users.better_auth_user_id`.
 *
 * The `clerkUserId` field name is preserved in the return shape for
 * churn reduction; it holds the BA user id post-cutover.
 *
 * `knownAppUserId` lets callers that already have the app `users.id` UUID
 * (e.g. inside `unstable_cache` boundaries that can't call `headers()`)
 * short-circuit the session read. The app user's `betterAuthUserId` is
 * resolved from the DB.
 */
async function resolveAuthIdentity(knownAppUserId?: string): Promise<{
  clerkUserId: string | null;
  email: string | null;
}> {
  if (knownAppUserId) {
    const [appUser] = await db
      .select({
        betterAuthUserId: users.betterAuthUserId,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, knownAppUserId))
      .limit(1);
    if (!appUser?.betterAuthUserId) {
      return { clerkUserId: null, email: appUser?.email ?? null };
    }
    return {
      clerkUserId: appUser.betterAuthUserId,
      email: appUser.email,
    };
  }

  const bypassSession = await getCachedDevTestAuthSession();
  if (bypassSession) {
    return {
      clerkUserId: bypassSession.dbUserId,
      email: bypassSession.email,
    };
  }

  try {
    const headerStore = await headers();
    const session = await auth.api.getSession({ headers: headerStore });
    if (!session) {
      return { clerkUserId: null, email: null };
    }
    return {
      clerkUserId: session.user.id,
      email: session.user.email,
    };
  } catch {
    // Outside a request scope (unstable_cache, scripts) — degrade to
    // unauthenticated. Callers that need the user inside cache boundaries
    // must pass `knownAppUserId`.
    return { clerkUserId: null, email: null };
  }
}

async function loadAuthGateRecord(
  betterAuthUserId: string,
  email: string | null
): Promise<AuthGateRecord | AuthGateResult | undefined> {
  try {
    const [dbResult] = await db
      .select({
        id: users.id,
        email: users.email,
        userStatus: users.userStatus,
        isAdmin: users.isAdmin,
        isPro: users.isPro,
        deletedAt: users.deletedAt,
        profileId: creatorProfiles.id,
        profileUsername: creatorProfiles.username,
        profileUsernameNormalized: creatorProfiles.usernameNormalized,
        profileDisplayName: creatorProfiles.displayName,
        profileIsPublic: creatorProfiles.isPublic,
        profileAvatarUrl: creatorProfiles.avatarUrl,
        profileOnboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.id, users.activeProfileId))
      .where(eq(users.betterAuthUserId, betterAuthUserId))
      .limit(1);

    return dbResult;
  } catch (error) {
    if (canUseE2ETestAuthFallback()) {
      Sentry.addBreadcrumb({
        category: 'auth-gate',
        level: 'warning',
        message: 'Using E2E test auth fallback after DB lookup failure',
        data: {
          betterAuthUserId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return createE2ETestAuthGateResult(betterAuthUserId, email);
    }
    throw error;
  }
}

function toAuthGateDbUser(
  dbResult: AuthGateRecord | undefined
): AuthGateDbUser | null {
  if (!dbResult) {
    return null;
  }

  return {
    id: dbResult.id,
    email: dbResult.email,
    userStatus: dbResult.userStatus,
    isAdmin: dbResult.isAdmin,
    isPro: dbResult.isPro,
    deletedAt: dbResult.deletedAt,
  };
}

function toAuthGateProfile(
  dbResult: AuthGateRecord | undefined
): AuthGateProfile | null {
  if (!dbResult?.profileId) {
    return null;
  }

  return {
    id: dbResult.profileId,
    username: dbResult.profileUsername,
    usernameNormalized: dbResult.profileUsernameNormalized,
    displayName: dbResult.profileDisplayName,
    avatarUrl: dbResult.profileAvatarUrl,
    isPublic: dbResult.profileIsPublic,
    onboardingCompletedAt: dbResult.profileOnboardingCompletedAt,
    isClaimed: true, // joined via activeProfileId = claimed
  };
}

export interface ResolveUserStateOptions {
  createDbUserIfMissing?: boolean;
  /**
   * Pre-resolved app `users.id` UUID. When provided, skips the Better Auth
   * session read (which calls `headers()` and must NOT be invoked inside
   * `unstable_cache` / `"use cache"` boundaries).
   *
   * Pass this when the app user id is already known (e.g. from a cached
   * function that received it as a parameter). gate.ts resolves the
   * user's `betterAuthUserId` from the DB and proceeds.
   *
   * (Field name preserved for churn reduction; was `knownClerkUserId` in
   * the Clerk era and accepted a Clerk user id.)
   */
  knownClerkUserId?: string;
}

function serializeResolveUserStateOptions(
  options: ResolveUserStateOptions
): string {
  return JSON.stringify({
    createDbUserIfMissing: options.createDbUserIfMissing ?? true,
    knownClerkUserId: options.knownClerkUserId ?? null,
  });
}

/**
 * Centralized auth gate function that resolves the current user's state.
 *
 * This is the single source of truth for auth state resolution. It replaces
 * scattered auth checks in layout.tsx, onboarding/page.tsx, and claim/[token]/page.tsx.
 *
 * Resolution order:
 * 1. Check Better Auth session → UNAUTHENTICATED
 * 2. Check DB user existence → NEEDS_DB_USER (auto-creates)
 * 3. Check user status → BANNED
 * 4. Check waitlist/profile state → WAITLIST_*, NEEDS_ONBOARDING, ACTIVE
 *
 * Wrapped in React.cache() so repeated calls within the same server request
 * reuse one DB/auth resolution pass (JOV-2993).
 *
 * @param options.createDbUserIfMissing - If true, creates a DB user row when missing (default: true)
 * @param options.knownClerkUserId - Pre-resolved app `users.id` UUID (see ResolveUserStateOptions)
 */
async function resolveUserStateInternal(
  options: ResolveUserStateOptions = {}
): Promise<AuthGateResult> {
  const { createDbUserIfMissing = true, knownClerkUserId } = options;

  // 1. Resolve Better Auth identity and prefetch waitlist gate in parallel.
  const identityPromise = resolveAuthIdentity(knownClerkUserId);
  const waitlistGatePromise = isWaitlistGateEnabled();
  const { clerkUserId, email } = await identityPromise;

  if (!clerkUserId) {
    return createUnauthenticatedAuthGateResult();
  }

  // 2. Query DB user AND profile in a single JOIN query (performance optimization)
  const [lookupResult, waitlistGateEnabled] = await Promise.all([
    loadAuthGateRecord(clerkUserId, email),
    waitlistGatePromise,
  ]);
  if (lookupResult && 'state' in lookupResult) {
    return lookupResult;
  }

  const dbResult = lookupResult;
  const dbUser = toAuthGateDbUser(dbResult);
  const resolvedEmail = email ?? dbUser?.email ?? null;

  const baseContext = {
    isAdmin: dbUser?.isAdmin ?? false,
    isPro: dbUser?.isPro ?? false,
    email: resolvedEmail,
  };

  // Check if user is blocked (banned, suspended, or deleted)
  const statusCheck = checkUserStatus(
    dbUser?.userStatus ?? null,
    dbUser?.deletedAt ?? null
  );
  if (statusCheck.isBlocked && statusCheck.blockedState) {
    return {
      state: statusCheck.blockedState,
      clerkUserId,
      dbUserId: dbUser?.id ?? null,
      profileId: null,
      redirectTo: statusCheck.redirectTo,
      context: baseContext,
    };
  }

  // 2b. If no DB user exists, create one if requested
  let dbUserId: string | null = dbUser?.id ?? null;
  let currentUserStatus = dbUser?.userStatus ?? null;
  let currentDeletedAt = dbUser?.deletedAt ?? null;

  if (!dbUserId && canUseE2ETestAuthFallback()) {
    Sentry.addBreadcrumb({
      category: 'auth-gate',
      level: 'warning',
      message: 'Using E2E test auth fallback for missing DB user',
      data: { clerkUserId },
    });
    return createE2ETestAuthGateResult(clerkUserId, resolvedEmail);
  }

  let profile = toAuthGateProfile(dbResult);

  if (!dbUserId) {
    const creationResult = await handleMissingDbUser(
      {
        createDbUserIfMissing,
        betterAuthUserId: clerkUserId,
        email: resolvedEmail,
        baseContext,
      },
      waitlistGateEnabled
    );

    if ('state' in creationResult) {
      return creationResult;
    }

    dbUserId = creationResult.dbUserId;
    const [createdUser] = await db
      .select({
        userStatus: users.userStatus,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, dbUserId))
      .limit(1);
    currentUserStatus = createdUser?.userStatus ?? null;
    currentDeletedAt = createdUser?.deletedAt ?? null;
    profile = null;
  }

  const state = resolveCanonicalState({
    isAuthenticated: true,
    hasDbUser: Boolean(dbUserId),
    userStatus: currentUserStatus,
    deletedAt: currentDeletedAt,
    waitlistGateEnabled,
    profile,
  });

  return {
    state,
    clerkUserId,
    dbUserId,
    profileId: profile?.id ?? null,
    redirectTo: getRedirectForState(state),
    context: {
      isAdmin: dbUser?.isAdmin ?? false,
      isPro: dbUser?.isPro ?? false,
      email: resolvedEmail,
    },
  };
}

const resolveUserStateCached = cache(
  async (optionsKey: string): Promise<AuthGateResult> => {
    const parsed = JSON.parse(optionsKey) as {
      createDbUserIfMissing: boolean;
      knownClerkUserId: string | null;
    };

    return resolveUserStateInternal({
      createDbUserIfMissing: parsed.createDbUserIfMissing,
      knownClerkUserId: parsed.knownClerkUserId ?? undefined,
    });
  }
);

export async function resolveUserState(
  options: ResolveUserStateOptions = {}
): Promise<AuthGateResult> {
  return resolveUserStateCached(serializeResolveUserStateOptions(options));
}

// =============================================================================
// Waitlist Access Helpers (exported for reuse)
// =============================================================================

export type WaitlistStatus = CanonicalWaitlistStatus;

export interface WaitlistAccessResult {
  entryId: string | null;
  status: WaitlistStatus | null;
}

/**
 * Check waitlist access by email.
 * Returns the waitlist entry status.
 *
 * This is the single source of truth for waitlist status checks.
 * Use this instead of querying waitlist tables directly.
 */
export async function getWaitlistAccess(
  email: string
): Promise<WaitlistAccessResult> {
  return checkWaitlistAccessInternal(email);
}

/**
 * Internal helper to check waitlist access by email.
 */
async function checkWaitlistAccessInternal(email: string): Promise<{
  entryId: string | null;
  status: WaitlistStatus | null;
}> {
  const normalizedEmail = normalizeEmail(email);

  // JOV-1963: order by createdAt DESC so the LATEST waitlist entry wins when
  // a single email has multiple entries. Previously the query relied on
  // arbitrary ordering, which could surface a stale `'new'` row even after
  // the user had been invited or claimed access.
  const [entry] = await db
    .select({
      id: waitlistEntries.id,
      status: waitlistEntries.status,
    })
    .from(waitlistEntries)
    .where(
      drizzleSql`${waitlistEntries.emailNormalized} = ${normalizedEmail} OR lower(${waitlistEntries.email}) = ${normalizedEmail}`
    )
    .orderBy(
      drizzleSql`${waitlistEntries.canonical} DESC, ${waitlistEntries.createdAt} DESC`
    )
    .limit(1);

  if (!entry) {
    return { entryId: null, status: null };
  }

  return {
    entryId: entry.id,
    status: entry.status,
  };
}

// State utilities (getRedirectForState, canAccessApp, canAccessOnboarding,
// requiresRedirect) are re-exported from canonical-user-state.ts at the top
// of this file. No local definitions needed.
