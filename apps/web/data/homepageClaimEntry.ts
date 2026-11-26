import { APP_ROUTES } from '@/constants/routes';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import {
  buildClaimProfileStartHref,
  CLAIM_PROFILE_STARTER_PROMPT,
} from './marketingCtaIntents';

/** Matches `/start` handoff artist-name budget (start-entry-handoff). */
export const HOMEPAGE_CLAIM_ARTIST_NAME_MAX_CHARS = 80;

/**
 * Normalize a homepage claim-field value into a handle `/start` will accept.
 * Invalid / display-name input returns null so callers never emit `handle=`.
 */
export function normalizeHomepageHandleCandidate(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  const handle = raw.trim().replace(/^@/, '').toLowerCase();
  if (
    handle.length < USERNAME_MIN_LENGTH ||
    handle.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(handle)
  ) {
    return null;
  }
  return handle;
}

function sanitizeArtistNamePrior(raw: string): string {
  return raw
    .replaceAll(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/^@/, '')
    .slice(0, HOMEPAGE_CLAIM_ARTIST_NAME_MAX_CHARS);
}

/**
 * Starter prompt when the homepage field held a display name (spaces /
 * invalid handle chars). Keeps Spotify/search as the identity path and never
 * locks `handle=` to the typed name.
 */
export function buildClaimProfileArtistSearchStarterPrompt(
  artistName: string
): string {
  const name = sanitizeArtistNamePrior(artistName);
  if (!name) return CLAIM_PROFILE_STARTER_PROMPT;
  return `${CLAIM_PROFILE_STARTER_PROMPT} Find ${name} on Spotify.`;
}

/**
 * True when the field looks like a person/artist display name rather than a
 * claimable handle (spaces, apostrophes, accents, etc.).
 * Handle-shaped values that are only too short/long stay validation errors.
 */
export function isHomepageDisplayNamePrior(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return false;
  if (normalizeHomepageHandleCandidate(trimmed)) return false;
  const candidate = trimmed.replace(/^@/, '').toLowerCase();
  // Letters/digits/._- only → still a handle attempt, not a search prior.
  if (USERNAME_PATTERN.test(candidate)) return false;
  return true;
}

/**
 * Homepage `yourname` → `/start` href.
 *
 * - Valid handle → claim prior with `handle=`
 * - Display name / invalid handle chars → claim + Spotify search prior, no `handle=`
 * - Empty → generic claim starter
 */
export function buildHomepageClaimEntryHref(rawInput?: string): string {
  const trimmed = rawInput?.trim() ?? '';
  if (!trimmed) return buildClaimProfileStartHref();

  const handle = normalizeHomepageHandleCandidate(trimmed);
  if (handle) return buildClaimProfileStartHref(handle);

  if (!isHomepageDisplayNamePrior(trimmed)) {
    return buildClaimProfileStartHref();
  }

  const params = new URLSearchParams({
    starter_prompt: buildClaimProfileArtistSearchStarterPrompt(trimmed),
  });
  return `${APP_ROUTES.START}?${params.toString()}`;
}
