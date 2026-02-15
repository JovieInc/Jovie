/**
 * Waitlist Feature Flag
 *
 * Controls whether the waitlist gate is active for new signups.
 * Defaults to OFF (disabled) when the env var is missing or not 'true'.
 *
 * When disabled:
 * - New users go directly to onboarding (skip waitlist)
 * - Existing waitlist entries and admin UI remain intact
 * - Setting WAITLIST_ENABLED=true re-enables the gate
 *
 * NOTE: No `import 'server-only'` — this must work in Edge middleware (proxy.ts).
 * Uses process.env directly for zero-overhead synchronous reads.
 */

/**
 * Check if the waitlist gate is enabled.
 * Returns false when WAITLIST_ENABLED is missing or not 'true'.
 */
export function isWaitlistEnabled(): boolean {
  return process.env.WAITLIST_ENABLED === 'true';
}
