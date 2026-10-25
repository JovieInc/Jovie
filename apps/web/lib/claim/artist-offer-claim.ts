/**
 * Self-serve claim for the $12/month artist profile (EVENT: Tim, 2026-10-20).
 *
 * `/claim` finds or creates an artist profile, then hands off to the
 * existing claim, sign-in, onboarding and Stripe Checkout path. Payment never
 * grants verification. Identity ownership is still decided by the existing
 * claim proof (exact Spotify artist match or claim token). High-reach artists
 * still reach checkout, but their identity is held as a verification request
 * on the buyer's own profile until an operator verifies it
 * (`lib/claim/claim-verification.ts`).
 *
 * Pure module: decisions only, no I/O. The route lives at
 * `app/claim/start/route.ts`.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  CLAIM_VERIFICATION_REACH_THRESHOLD,
  requiresClaimVerification,
} from './claim-verification';

/**
 * Reach threshold for ownership verification. One config value, owned by
 * `lib/claim/claim-verification.ts` (Spotify followers; taste default 50k).
 */
export const HIGH_PROFILE_FOLLOWER_THRESHOLD =
  CLAIM_VERIFICATION_REACH_THRESHOLD;

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
  return requiresClaimVerification(followers);
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
 * already-claimed viewers never pay twice; existing unclaimed profiles reuse
 * the proof-checked `/{username}/claim` path unless the artist is high reach,
 * in which case the buyer gets their own profile and a verification request.
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

  // High reach: never the proof-checked prebuilt-profile takeover. The buyer
  // creates their own profile and pays as usual; onboarding stores the artist
  // as a verification request instead of linking it.
  if (artist.profile && !requiresManualVerification(artist.followers)) {
    return `/${encodeURIComponent(artist.profile.username)}/claim?next=auth`;
  }

  const spotifyUrl = `https://open.spotify.com/artist/${artist.spotifyId}`;
  if (viewer.signedIn) return APP_ROUTES.START;
  return signupHref({
    spotify_url: spotifyUrl,
    ...(artist.name ? { artist_name: artist.name } : {}),
  });
}
