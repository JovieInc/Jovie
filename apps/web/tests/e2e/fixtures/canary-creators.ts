/**
 * Canary creator fixtures (JOV-1872)
 *
 * Defines the stable creator identity used by the public-profile canary spec.
 * Tim White is the canonical demo creator per the founder-featured-creator
 * identity rule in CLAUDE.md.
 *
 * Important: do NOT add test-only fake handles here. The canary must exercise
 * real data — the whole point is to catch regressions on the real production
 * profile surface before users see them.
 */

/**
 * The canonical canary creator.
 * Tim's profile must always exist and be public in both dev and prod.
 */
export const CANARY_CREATOR = {
  /** URL handle / slug (matches CANARY_CREATOR_HANDLE in lib/canaries/public-profile.ts) */
  handle: 'tim',
  /** Canonical Spotify artist ID — per CLAUDE.md founder identity rule */
  spotifyId: '4u',
  /** Display name expected in the page h1 (case-insensitive comparison in spec) */
  displayNameFragment: 'Tim',
} as const;

/** A fake email to use for notification subscription flow assertions. */
export const CANARY_SUBSCRIBE_EMAIL = `canary+${Date.now()}@test.jov.ie`;

/** Routes exercised by the canary spec. */
export const CANARY_SPEC_ROUTES = {
  profile: `/${CANARY_CREATOR.handle}`,
  alerts: `/${CANARY_CREATOR.handle}/alerts`,
  pay: `/${CANARY_CREATOR.handle}/pay`,
  profileNoRedirect: `/${CANARY_CREATOR.handle}?noredirect=1`,
} as const;
