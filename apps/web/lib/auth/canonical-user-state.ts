/**
 * Canonical User State Resolver
 *
 * Single source of truth for user state determination.
 * Consumed by gate.ts (server) today. Proxy (edge) integration is planned
 * as part of Stream 1 completion (see plan: Streams 1-5).
 *
 * resolveCanonicalState decision tree (what THIS pure function covers):
 * ┌──────────────────────────────────────────────────────────────┐
 * │  !isAuthenticated ──────────────────► UNAUTHENTICATED       │
 * │  !hasDbUser ────────────────────────► NEEDS_DB_USER         │
 * │  deletedAt / banned / suspended ───► BANNED                 │
 * │  waitlistGate && !approved:                                  │
 * │    status=waitlist_pending ─────────► WAITLIST_PENDING       │
 * │    otherwise ──────────────────────► NEEDS_WAITLIST_SUB     │
 * │  !profileComplete ─────────────────► NEEDS_ONBOARDING       │
 * │  all checks pass ─────────────────► ACTIVE                  │
 * └──────────────────────────────────────────────────────────────┘
 *
 * States NOT produced by this function (handled by gate.ts orchestration):
 *   - USER_CREATION_FAILED: requires I/O (DB write failure detection)
 *   - NEEDS_DB_USER → NEEDS_WAITLIST_SUBMISSION: transition handled by
 *     gate.ts handleMissingDbUser when email isn't on the approved list
 *
 * This module has NO 'server-only' directive and NO DB imports so it
 * works in Edge Runtime (proxy.ts), Node Runtime (gate.ts, dashboard),
 * and test environments.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  isProfileComplete,
  type ProfileCompletenessFields,
} from './profile-completeness';

// ---------------------------------------------------------------------------
// State Enum
// ---------------------------------------------------------------------------

export enum CanonicalUserState {
  /** No authenticated session */
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  /** Clerk user exists but no DB user row yet */
  NEEDS_DB_USER = 'NEEDS_DB_USER',
  /** User needs to submit waitlist application */
  NEEDS_WAITLIST_SUBMISSION = 'NEEDS_WAITLIST_SUBMISSION',
  /** Waitlist application submitted but not yet approved */
  WAITLIST_PENDING = 'WAITLIST_PENDING',
  /** User has access but needs to complete onboarding */
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',
  /** Fully active user with complete profile */
  ACTIVE = 'ACTIVE',
  /** User has been banned */
  BANNED = 'BANNED',
  /** User creation failed after retries - prevents redirect loops */
  USER_CREATION_FAILED = 'USER_CREATION_FAILED',
}

// ---------------------------------------------------------------------------
// Input Interface
// ---------------------------------------------------------------------------

/**
 * Input for canonical state resolution.
 * Callers assemble this from their own data sources (DB query, cache, etc.).
 */
export interface UserStateInput {
  /** Whether a Clerk session exists */
  isAuthenticated: boolean;
  /** Whether a DB user row exists */
  hasDbUser: boolean;
  /** User status from DB (e.g., 'active', 'banned', 'waitlist_pending') */
  userStatus: string | null;
  /** Soft deletion timestamp */
  deletedAt: Date | null;
  /** Whether the waitlist gate is enabled globally */
  waitlistGateEnabled: boolean;
  /** Profile data for completeness check, or null if no profile */
  profile: ProfileCompletenessFields | null;
}

// ---------------------------------------------------------------------------
// Statuses that indicate waitlist approval
// ---------------------------------------------------------------------------

const APPROVED_STATUSES = new Set([
  'waitlist_approved',
  'profile_claimed',
  'onboarding_incomplete',
  'active',
]);

// ---------------------------------------------------------------------------
// State Resolver (pure function)
// ---------------------------------------------------------------------------

/**
 * Resolves canonical user state from input.
 *
 * Pure function — no I/O, no side effects, no imports beyond profile-completeness.
 * Edge-compatible.
 *
 * If input is invalid (null fields where unexpected), returns UNAUTHENTICATED
 * as a safe default rather than throwing.
 */
export function resolveCanonicalState(
  input: UserStateInput
): CanonicalUserState {
  // Not authenticated → UNAUTHENTICATED
  if (!input.isAuthenticated) {
    return CanonicalUserState.UNAUTHENTICATED;
  }

  // No DB user → NEEDS_DB_USER
  if (!input.hasDbUser) {
    return CanonicalUserState.NEEDS_DB_USER;
  }

  // Banned/deleted/suspended → BANNED
  if (input.deletedAt) {
    return CanonicalUserState.BANNED;
  }
  if (input.userStatus === 'banned' || input.userStatus === 'suspended') {
    return CanonicalUserState.BANNED;
  }

  // Waitlist gate is enabled and user is not approved
  if (
    input.waitlistGateEnabled &&
    !APPROVED_STATUSES.has(input.userStatus ?? '')
  ) {
    // User has submitted waitlist → pending
    if (input.userStatus === 'waitlist_pending') {
      return CanonicalUserState.WAITLIST_PENDING;
    }
    // User hasn't submitted yet
    return CanonicalUserState.NEEDS_WAITLIST_SUBMISSION;
  }

  // Past waitlist — check profile completeness
  if (!input.profile || !isProfileComplete(input.profile)) {
    return CanonicalUserState.NEEDS_ONBOARDING;
  }

  // All checks passed
  return CanonicalUserState.ACTIVE;
}

// ---------------------------------------------------------------------------
// Redirect Map
// ---------------------------------------------------------------------------

const ONBOARDING_FRESH_SIGNUP = `${APP_ROUTES.ONBOARDING}?fresh_signup=true`;

const STATE_REDIRECT_MAP: Record<CanonicalUserState, string | null> = {
  [CanonicalUserState.UNAUTHENTICATED]: APP_ROUTES.SIGNIN,
  [CanonicalUserState.NEEDS_DB_USER]: ONBOARDING_FRESH_SIGNUP,
  [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION]: APP_ROUTES.WAITLIST,
  [CanonicalUserState.WAITLIST_PENDING]: APP_ROUTES.WAITLIST,
  [CanonicalUserState.NEEDS_ONBOARDING]: ONBOARDING_FRESH_SIGNUP,
  [CanonicalUserState.BANNED]: APP_ROUTES.BANNED,
  [CanonicalUserState.USER_CREATION_FAILED]: APP_ROUTES.USER_CREATION_FAILED,
  [CanonicalUserState.ACTIVE]: null,
};

/**
 * Returns the redirect destination for a given state, or null if no redirect needed.
 */
export function getRedirectForState(state: CanonicalUserState): string | null {
  return STATE_REDIRECT_MAP[state] ?? null;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Whether the state allows access to the main app.
 */
export function canAccessApp(state: CanonicalUserState): boolean {
  return state === CanonicalUserState.ACTIVE;
}

/**
 * Whether the state allows access to onboarding.
 */
export function canAccessOnboarding(state: CanonicalUserState): boolean {
  return (
    state === CanonicalUserState.NEEDS_ONBOARDING ||
    state === CanonicalUserState.ACTIVE
  );
}

/**
 * Whether the state requires a redirect away from protected routes.
 */
export function requiresRedirect(state: CanonicalUserState): boolean {
  return state !== CanonicalUserState.ACTIVE;
}
