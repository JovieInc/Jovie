/**
 * Canary creator fixtures (JOV-1872)
 *
 * Defines the stable synthetic identity used by the public-profile canary spec.
 *
 * Important: this fixture is explicitly non-indexed by the public-profile
 * indexing policy. Canary traffic must not mutate or depend on a real creator.
 */

/**
 * The canonical non-indexed canary creator.
 * This profile must always exist and be public in both dev and prod.
 */
export const CANARY_CREATOR = {
  /** URL handle / slug (matches CANARY_CREATOR_HANDLE in lib/canaries/public-profile.ts) */
  handle: 'authqaprod',
} as const;

/** A fake email to use for notification subscription flow assertions. */
export const CANARY_SUBSCRIBE_EMAIL = `canary+${Date.now()}@test.jov.ie`;

/** Routes exercised by the canary spec. */
export const CANARY_SPEC_ROUTES = {
  profile: `/${CANARY_CREATOR.handle}`,
  alerts: `/${CANARY_CREATOR.handle}/alerts`,
  listen: `/${CANARY_CREATOR.handle}/listen`,
  profileNoRedirect: `/${CANARY_CREATOR.handle}?noredirect=1`,
} as const;
