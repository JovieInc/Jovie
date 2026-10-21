/**
 * Self-serve claim for the $12/month artist profile (EVENT: Tim, 2026-10-20).
 *
 * `/claim` finds or creates an artist profile, then hands off to the
 * existing claim, sign-in, onboarding and Stripe Checkout path. Payment never
 * grants verification. Identity ownership is still decided by the existing
 * claim proof (exact Spotify artist match or claim token), and high-profile
 * artists are never self-serve: they need manual verification first.
 *
 * Pure module: decisions only, no I/O. The route lives at
 * `app/claim/start/route.ts`.
 */

import { APP_ROUTES } from '@/constants/routes';

/**
 * At or above this many Spotify followers an artist is a public figure whose
 * identity cannot be claimed self-serve. Re-evaluate when the manual
 * verification queue exceeds 20 requests a week; then automate verification
 * (e.g. Spotify for Artists proof) instead of moving the threshold.
 */
export const HIGH_PROFILE_FOLLOWER_THRESHOLD = 100_000;

/** Short-lived marker that routes onboarding checkout back to the claim flow. */
export const CLAIM_FLOW_COOKIE = 'jv_claim_flow';
export const CLAIM_FLOW_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;

/** Same cookie names and lifetime as `lib/auth/plan-intent.ts`. */
export const PLAN_INTENT_COOKIE = 'jovie_plan_intent';
export const BILLING_INTERVAL_COOKIE = 'jovie_billing_interval';
export const PLAN_INTENT_MAX_AGE_SECONDS = 30 * 60;

const SPOTIFY_ARTIST_ID_PATTERN = /^[0-9A-Za-z]{22}$/;

export const CLAIM_PAGE_STATES = [
  'already_claimed',
  'verification_required',
  'already_subscribed',
  'checkout_canceled',
  'unavailable',
] as const;

export type ClaimPageState = (typeof CLAIM_PAGE_STATES)[number];

export function parseClaimPageState(
  value: string | string[] | null | undefined
): ClaimPageState | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (CLAIM_PAGE_STATES as readonly string[]).includes(raw ?? '')
    ? (raw as ClaimPageState)
    : null;
}

export function claimStateHref(state: ClaimPageState): string {
  return `${APP_ROUTES.CLAIM}?state=${state}`;
}

export function isSpotifyArtistId(
  value: string | null | undefined
): value is string {
  return typeof value === 'string' && SPOTIFY_ARTIST_ID_PATTERN.test(value);
}

/** Famous names are never self-serve; unknown reach is not "famous". */
export function requiresManualVerification(
  followers: number | null | undefined
): boolean {
  return (
    typeof followers === 'number' &&
    Number.isFinite(followers) &&
    followers >= HIGH_PROFILE_FOLLOWER_THRESHOLD
  );
}

/** Checkout for an artist who already has a live, claimed profile. */
export const CLAIM_CHECKOUT_HREF = `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=pro&interval=month&source=intent`;

export interface ClaimViewer {
  readonly signedIn: boolean;
  /** Paid (not trialing) Pro subscriber. */
  readonly isSubscriber: boolean;
  /** Signed-in user already owns a claimed profile. */
  readonly hasClaimedProfile: boolean;
}

export interface ClaimArtist {
  readonly spotifyId: string;
  readonly name: string | null;
  readonly followers: number | null;
  /** Existing Jovie profile for this Spotify artist, if any. */
  readonly profile: {
    readonly username: string;
    readonly isClaimed: boolean;
  } | null;
}

function signupHref(params: Record<string, string>): string {
  const search = new URLSearchParams({
    plan: 'pro',
    interval: 'month',
    ...params,
  });
  return `${APP_ROUTES.SIGNUP}?${search.toString()}`;
}

/**
 * Decide where a claim attempt goes next. Order matters: subscribers and
 * already-claimed viewers never pay twice; famous names stop before any
 * ownership step; existing unclaimed profiles reuse the proof-checked
 * `/{username}/claim` path.
 */
export function resolveClaimRedirect(input: {
  readonly viewer: ClaimViewer;
  readonly artist: ClaimArtist | null;
}): string {
  const { viewer, artist } = input;

  if (viewer.isSubscriber) return claimStateHref('already_subscribed');
  if (viewer.hasClaimedProfile) return CLAIM_CHECKOUT_HREF;

  if (!artist) {
    return viewer.signedIn ? APP_ROUTES.START : signupHref({});
  }

  if (artist.profile?.isClaimed) return claimStateHref('already_claimed');
  if (requiresManualVerification(artist.followers)) {
    return claimStateHref('verification_required');
  }

  if (artist.profile) {
    return `/${encodeURIComponent(artist.profile.username)}/claim?next=auth`;
  }

  const spotifyUrl = `https://open.spotify.com/artist/${artist.spotifyId}`;
  if (viewer.signedIn) return APP_ROUTES.START;
  return signupHref({
    spotify_url: spotifyUrl,
    ...(artist.name ? { artist_name: artist.name } : {}),
  });
}
