/**
 * Canonical User State Resolver
 *
 * Single source of truth for user state determination.
 * Both proxy (edge) and gate (server) call this function.
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   STATE MACHINE                              │
 * │                                                              │
 * │  UNAUTHENTICATED ──► NEEDS_DB_USER ──► NEEDS_WAITLIST_SUB  │
 * │                                    └──► NEEDS_ONBOARDING    │
 * │  NEEDS_WAITLIST_SUB ──► WAITLIST_PENDING                    │
 * │  WAITLIST_PENDING ──► (approved) ──► NEEDS_ONBOARDING       │
 * │  NEEDS_ONBOARDING ──► ACTIVE                                │
 * │  Any state ──► BANNED (if deleted/suspended/banned)         │
 * │  NEEDS_DB_USER ──► USER_CREATION_FAILED (if retries fail)  │
 * └──────────────────────────────────────────────────────────────┘
 *
 * This module has NO 'server-only' directive and NO DB imports so it
 * works in Edge Runtime (proxy.ts), Node Runtime (gate.ts, dashboard),
 * and test environments.
 */

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

  // Pending users remain gated until an intake submission is accepted or an
  // admin approves them. Turning the launch gate off only opens daily intake
  // capacity; it must not unlock already-waitlisted accounts by navigation.
  if (input.userStatus === 'waitlist_pending') {
    return CanonicalUserState.WAITLIST_PENDING;
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

const STATE_REDIRECT_MAP: Record<CanonicalUserState, string | null> = {
  [CanonicalUserState.UNAUTHENTICATED]: '/signin',
  [CanonicalUserState.NEEDS_DB_USER]: '/onboarding?fresh_signup=true',
  [CanonicalUserState.NEEDS_WAITLIST_SUBMISSION]: '/waitlist',
  [CanonicalUserState.WAITLIST_PENDING]: '/waitlist',
  [CanonicalUserState.NEEDS_ONBOARDING]: '/onboarding?fresh_signup=true',
  [CanonicalUserState.BANNED]: '/unavailable',
  [CanonicalUserState.USER_CREATION_FAILED]: '/error/user-creation-failed',
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
