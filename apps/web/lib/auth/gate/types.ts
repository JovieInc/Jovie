/**
 * Auth gate type definitions
 */

/**
 * Centralized user state enum for auth gating decisions.
 *
 * This replaces scattered auth checks throughout the codebase with a single
 * source of truth for user state resolution. Each state has a clear redirect
 * destination and guards users from accessing features they shouldn't.
 */
export enum UserState {
  /** No authenticated session */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /** Clerk user exists but no DB user row yet */
  NEEDS_DB_USER = 'NEEDS_DB_USER',
  /** User needs to submit waitlist application */
  NEEDS_WAITLIST_SUBMISSION = 'NEEDS_WAITLIST_SUBMISSION',
  /** Waitlist application submitted but not yet approved */
  WAITLIST_PENDING = 'WAITLIST_PENDING',
  /** Waitlist application approved, needs to claim invite */
  WAITLIST_INVITED = 'WAITLIST_INVITED',
  /** User has access but needs to complete onboarding */
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',
  /** Fully active user with complete profile */
  ACTIVE = 'ACTIVE',
  /** User has been banned */
  BANNED = 'BANNED',
}

/**
 * Result of resolving user state. Contains all information needed
 * to make auth gating decisions and redirect users appropriately.
 */
export interface AuthGateResult {
  /** The resolved user state */
  state: UserState;
  /** Clerk user ID if authenticated */
  clerkUserId: string | null;
  /** Database user ID if exists */
  dbUserId: string | null;
  /** Creator profile ID if exists */
  profileId: string | null;
  /** Suggested redirect path based on state, or null if no redirect needed */
  redirectTo: string | null;
  /** Additional context for the caller */
  context: AuthGateContext;
}

export interface AuthGateContext {
  isAdmin: boolean;
  isPro: boolean;
  email: string | null;
  claimToken?: string;
}

export interface ResolveUserStateOptions {
  /** If true, creates a DB user row when missing (default: true) */
  createDbUserIfMissing?: boolean;
  /** If provided, used for claim flow state resolution */
  claimToken?: string;
}

export interface WaitlistAccessResult {
  entryId: string | null;
  status: 'new' | 'invited' | 'claimed' | 'rejected' | null;
  claimToken: string | null;
}

export interface ProfileCompleteness {
  username: string | null;
  usernameNormalized: string | null;
  displayName: string | null;
  isPublic: boolean | null;
  onboardingCompletedAt: Date | null;
}
