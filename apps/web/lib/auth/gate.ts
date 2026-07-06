import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { cache } from 'react';
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
import { getCachedCurrentUser, getOptionalAuth } from './cached';
import {
  CanonicalUserState,
  getRedirectForState,
  resolveCanonicalState,
} from './canonical-user-state';
import { syncEmailFromClerk } from './clerk-sync';
import { getServerClerkClient } from './request-clerk-client';
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
 */
export interface AuthGateResult {
  /** The resolved user state */
  state: CanonicalUserState;
  /** Clerk user ID if authenticated */
  clerkUserId: string | null;
  /** Database user ID if exists */
  dbUserId: string | null;
  /** Creator profile ID if exists */
  profileId: string | null;
  /** Suggested redirect path based on state, or null if no redirect needed */
  redirectTo: string | null;
  /** Additional context for the caller */
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

const CLERK_BACKEND_EMAIL_FALLBACK_ATTEMPTS = 4;
const CLERK_BACKEND_EMAIL_FALLBACK_DELAY_MS = 250;

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
 * the clerk_id adoption path in createUserWithRetry.
 */
function isPermanentError(error: Error): boolean {
  // Email uniqueness conflicts are recoverable via clerk_id adoption
  if (isUniqueViolation(error, 'users_email_unique')) {
    return false;
  }

  const msg = getDeepErrorMessage(error);
  return msg.includes('duplicate key') || msg.includes('constraint');
}

/**
 * Check if an insert error is an email uniqueness conflict and attempt
 * to adopt the existing row by updating its clerk_id.
 * Returns the adopted user ID, or null if not an email conflict.
 */
async function tryAdoptExistingUser(
  insertError: unknown,
  email: string | null,
  clerkUserId: string,
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
      clerkId: clerkUserId,
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
  clerkUserId: string,
  email: string | null,
  userStatus: UserLifecycleStatus,
  waitlistEntryId: string | undefined
): Promise<string> {
  try {
    const [createdUser] = await db
      .insert(users)
      .values({
        clerkId: clerkUserId,
        email,
        userStatus,
        waitlistEntryId,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
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
      clerkUserId,
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
 * Handles transient database errors that might occur during the Clerk
 * session propagation window after OTP verification.
 *
 * @param clerkUserId - The Clerk user ID
 * @param email - User's email address
 * @param waitlistEntryId - Optional waitlist entry ID
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Created/updated user ID or null if all retries fail
 */
async function createUserWithRetry(
  clerkUserId: string,
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
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      const userStatus = determineUserStatus(
        waitlistEntryId,
        existingUserData,
        waitlistGateEnabled
      );
      return await upsertUser(clerkUserId, email, userStatus, waitlistEntryId);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      const { summary, dbErrorCode, dbConstraint, dbDetail } =
        buildErrorSummary(error);
      await captureError(
        `User creation failed (attempt ${attempt + 1}/${maxRetries}): ${summary}`,
        lastError,
        {
          clerkUserId,
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
      clerkUserId,
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
  clerkUserId: string;
  email: string | null;
  baseContext: { isAdmin: boolean; isPro: boolean; email: string | null };
}

/**
 * Handle the case where no DB user exists for an authenticated Clerk user.
 * Returns either a complete AuthGateResult (for early return) or the new user ID.
 */
async function handleMissingDbUser(
  ctx: MissingDbUserContext,
  waitlistGateEnabled: boolean
): Promise<AuthGateResult | { dbUserId: string }> {
  const { createDbUserIfMissing, clerkUserId, email, baseContext } = ctx;

  // Don't create user - return NEEDS_DB_USER state
  if (!createDbUserIfMissing) {
    return {
      state: CanonicalUserState.NEEDS_DB_USER,
      clerkUserId,
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
      { clerkUserId, operation: 'resolveUserState' }
    );

    return {
      state: CanonicalUserState.USER_CREATION_FAILED,
      clerkUserId,
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

  // Check waitlist status before creating user. Gate OFF opens daily intake
  // capacity; it does not skip the access request flow for brand-new accounts.
  let waitlistEntryId: string | undefined;

  const waitlistResult = await checkWaitlistAccessInternal(email);

  if (isWaitlistPendingStatus(waitlistResult.status)) {
    return {
      state: CanonicalUserState.WAITLIST_PENDING,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/waitlist',
      context: { ...baseContext, email },
    };
  }

  if (!waitlistResult.status) {
    return {
      state: CanonicalUserState.NEEDS_WAITLIST_SUBMISSION,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/waitlist',
      context: { ...baseContext, email },
    };
  }

  if (!isWaitlistApprovedStatus(waitlistResult.status)) {
    return {
      state: CanonicalUserState.WAITLIST_PENDING,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/waitlist',
      context: { ...baseContext, email },
    };
  }

  waitlistEntryId = waitlistResult.entryId ?? undefined;

  // Create the user (without waitlist entry when waitlist is disabled)
  const newUserId = await createUserWithRetry(
    clerkUserId,
    email,
    waitlistEntryId,
    waitlistGateEnabled
  );

  if (!newUserId) {
    await captureCriticalError(
      'User creation failed after retries',
      new Error('User creation failed after maximum retry attempts'),
      {
        clerkUserId,
        email,
        waitlistEntryId,
        context: 'resolveUserState',
      }
    );

    return {
      state: CanonicalUserState.USER_CREATION_FAILED,
      clerkUserId,
      dbUserId: null,
      profileId: null,
      redirectTo: '/error/user-creation-failed',
      context: { ...baseContext, email, errorCode: 'USER_CREATION_FAILED' },
    };
  }

  return { dbUserId: newUserId };
}

async function resolveClerkIdentity(knownClerkUserId?: string): Promise<{
  clerkUserId: string | null;
  email: string | null;
}> {
  if (knownClerkUserId) {
    return { clerkUserId: knownClerkUserId, email: null };
  }

  const authResult = await getOptionalAuth();
  const clerkUserId = authResult.userId;
  if (!clerkUserId) {
    return { clerkUserId: null, email: null };
  }

  let email: string | null = null;
  try {
    const clerkUser = await getCachedCurrentUser();
    email = selectVerifiedClerkEmail(clerkUser?.emailAddresses);
  } catch {
    // Email is optional for redirect-only auth entry routes.
  }

  return { clerkUserId, email };
}

function selectVerifiedClerkEmail(
  emailAddresses:
    | ReadonlyArray<{
        readonly emailAddress?: string | null;
        readonly verification?: { readonly status?: string | null } | null;
      }>
    | null
    | undefined
): string | null {
  return (
    emailAddresses?.find(e => e.verification?.status === 'verified')
      ?.emailAddress ?? null
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveVerifiedEmailFromClerkBackend(
  clerkUserId: string
): Promise<string | null> {
  const clerk = await getServerClerkClient();
  if (!clerk) {
    Sentry.addBreadcrumb({
      category: 'auth-gate',
      level: 'warning',
      message: 'Clerk backend email fallback skipped: missing secret key',
      data: { clerkUserId },
    });
    return null;
  }

  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= CLERK_BACKEND_EMAIL_FALLBACK_ATTEMPTS;
    attempt++
  ) {
    try {
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const email = selectVerifiedClerkEmail(clerkUser.emailAddresses);
      if (email) return email;
    } catch (error) {
      lastError = error;
    }

    if (attempt < CLERK_BACKEND_EMAIL_FALLBACK_ATTEMPTS) {
      await sleep(CLERK_BACKEND_EMAIL_FALLBACK_DELAY_MS * attempt);
    }
  }

  Sentry.addBreadcrumb({
    category: 'auth-gate',
    level: 'warning',
    message: 'Clerk backend email fallback failed',
    data: {
      clerkUserId,
      attempts: CLERK_BACKEND_EMAIL_FALLBACK_ATTEMPTS,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    },
  });
  return null;
}

async function loadAuthGateRecord(
  clerkUserId: string,
  email: string | null
): Promise<AuthGateRecord | AuthGateResult | undefined> {
  try {
    const [dbResult] = await db
      .select({
        // User fields
        id: users.id,
        email: users.email,
        userStatus: users.userStatus,
        isAdmin: users.isAdmin,
        isPro: users.isPro,
        deletedAt: users.deletedAt,
        // Profile fields (nullable from LEFT JOIN)
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
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    return dbResult;
  } catch (error) {
    if (canUseE2ETestAuthFallback()) {
      Sentry.addBreadcrumb({
        category: 'auth-gate',
        level: 'warning',
        message: 'Using E2E test auth fallback after DB lookup failure',
        data: {
          clerkUserId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return createE2ETestAuthGateResult(clerkUserId, email);
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

async function syncVerifiedEmailIfNeeded(
  dbUser: AuthGateDbUser | null,
  email: string | null
) {
  if (!dbUser || !email || dbUser.email === email) {
    return;
  }

  // Best-effort sync - don't block auth on sync failure
  await syncEmailFromClerk(dbUser.id, email).catch(err => {
    Sentry.addBreadcrumb({
      category: 'auth-gate',
      message: 'Email sync failed',
      level: 'warning',
      data: {
        error: err instanceof Error ? err.message : String(err),
        userId: dbUser.id,
      },
    });
  });
}

export interface ResolveUserStateOptions {
  createDbUserIfMissing?: boolean;
  /**
   * Pre-resolved Clerk user ID. When provided, skips calling auth() and
   * currentUser() — both of which read request headers and must NOT be
   * called inside unstable_cache or "use cache" boundaries.
   *
   * Pass this when the Clerk user ID is already known (e.g. from a cached
   * function that received it as a parameter). In this case the verified
   * email is resolved from Clerk's backend API if a DB user must be created.
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
 * 1. Check Clerk authentication → UNAUTHENTICATED
 * 2. Check DB user existence → NEEDS_DB_USER (auto-creates)
 * 3. Check user status → BANNED
 * 4. Check waitlist/profile state → WAITLIST_*, NEEDS_ONBOARDING, ACTIVE
 *
 * Wrapped in React.cache() so repeated calls within the same server request
 * reuse one DB/auth resolution pass (JOV-2993).
 *
 * @param options.createDbUserIfMissing - If true, creates a DB user row when missing (default: true)
 */
async function resolveUserStateInternal(
  options: ResolveUserStateOptions = {}
): Promise<AuthGateResult> {
  const { createDbUserIfMissing = true, knownClerkUserId } = options;

  // 1. Resolve Clerk identity and prefetch waitlist gate in parallel.
  // Gate status is needed for every authenticated path; starting it early
  // overlaps with identity resolution and the DB JOIN below (JOV-2993).
  const identityPromise = resolveClerkIdentity(knownClerkUserId);
  const waitlistGatePromise = isWaitlistGateEnabled();
  const { clerkUserId, email } = await identityPromise;

  if (!clerkUserId) {
    return createUnauthenticatedAuthGateResult();
  }

  // 2. Query DB user AND profile in a single JOIN query (performance optimization)
  // This reduces database round trips from 2 to 1. Run in parallel with the
  // waitlist gate lookup started above (matches proxy-state.ts hot-path pattern).
  const [lookupResult, waitlistGateEnabled] = await Promise.all([
    loadAuthGateRecord(clerkUserId, email),
    waitlistGatePromise,
  ]);
  if (lookupResult && 'state' in lookupResult) {
    return lookupResult;
  }

  // Extract user data from result (may be undefined if no user exists)
  const dbResult = lookupResult;
  const dbUser = toAuthGateDbUser(dbResult);
  const resolvedEmail =
    !dbUser && !email
      ? await resolveVerifiedEmailFromClerkBackend(clerkUserId)
      : email;

  const baseContext = {
    isAdmin: dbUser?.isAdmin ?? false,
    isPro: dbUser?.isPro ?? false,
    email: resolvedEmail,
  };

  // Sync email from Clerk if different (Clerk is source of truth for identity)
  // Only sync verified emails to prevent hijacking. `resolvedEmail` is selected
  // from verified Clerk email addresses, either from currentUser() or the
  // backend fallback.
  await syncVerifiedEmailIfNeeded(dbUser, resolvedEmail);

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

  // Profile from the JOIN query (only valid if dbUser exists)
  let profile = toAuthGateProfile(dbResult);

  if (!dbUserId) {
    const creationResult = await handleMissingDbUser(
      {
        createDbUserIfMissing,
        clerkUserId,
        email: resolvedEmail,
        baseContext,
      },
      waitlistGateEnabled
    );

    // If creationResult is a full AuthGateResult, return it early
    if ('state' in creationResult) {
      return creationResult;
    }

    // Otherwise, we got the new user ID
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
    // New user won't have a profile yet
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
