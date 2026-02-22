import { BASE_URL, APP_URL as DOMAINS_APP_URL } from './domains';

export const APP_NAME = 'Jovie';
export const LEGAL_ENTITY_NAME = 'Jovie Technology Inc.';

/**
 * APP_URL - The app/dashboard domain (meetjovie.com)
 * Use this for:
 * - Dashboard/app routes
 * - Marketing pages
 * - Auth-related URLs
 * - Email links to app features
 *
 * For profile URLs (jov.ie), use BASE_URL instead.
 */
export const APP_URL = DOMAINS_APP_URL;

// Re-export domain URLs for convenience
export { BASE_URL, DOMAINS_APP_URL as DASHBOARD_URL };
export const MAX_SOCIAL_LINKS = 6;
export const LISTEN_COOKIE = 'jovie_dsp';
export const COUNTRY_CODE_COOKIE = 'jv_country';
export const AUDIENCE_ANON_COOKIE = 'jv_aid';
export const AUDIENCE_IDENTIFIED_COOKIE = 'jv_identified';
export const AUDIENCE_SPOTIFY_PREFERRED_COOKIE = 'jv_pref_spotify';
export const DSPS = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  bandcamp: 'bandcamp',
  amazon_music: 'amazon_music',
  pandora: 'pandora',
  napster: 'napster',
  iheartradio: 'iheartradio',
  audiomack: 'audiomack',
  qobuz: 'qobuz',
  anghami: 'anghami',
  boomplay: 'boomplay',
  tiktok: 'tiktok',
} as const;
export const DEFAULT_PROFILE_TAGLINE = 'Artist';
/** Fallback username when creator profile is not found */
export const UNKNOWN_ARTIST = 'Unknown Artist';
export const PAGE_SUBTITLES = {
  profile: 'Artist',
  tip: 'Tip with Venmo',
  listen: 'Choose a Service',
  subscribe: 'Get notified',
  about: 'About',
} as const;

// Legacy FEATURE_FLAGS removed (waitlist deprecated). Use `lib/feature-flags.ts`.

export const LEGAL = {
  privacyPath: '/legal/privacy',
  termsPath: '/legal/terms',
};

export const COPYRIGHT_YEAR = new Date().getFullYear();
export const getCopyrightText = (year?: number) =>
  `© ${year ?? COPYRIGHT_YEAR} ${LEGAL_ENTITY_NAME}`;

// Re-export from canonical source for backward compatibility
export { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms';
export type DSP = keyof typeof DSPS;

// Global platform popularity ordering (lower index = more popular)
// Used for initial/default ordering when personalized ranking is unavailable.
export const GLOBAL_PLATFORM_POPULARITY = [
  'spotify',
  'apple_music',
  'youtube',
  'instagram',
  'tiktok',
  'soundcloud',
  'bandcamp',
  'x',
  'twitter',
  'facebook',
  'telegram',
  'discord',
  'snapchat',
  'reddit',
  'pinterest',
] as const;

export const popularityIndex = (pid: string): number => {
  const i = GLOBAL_PLATFORM_POPULARITY.indexOf(
    pid as (typeof GLOBAL_PLATFORM_POPULARITY)[number]
  );
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

const REGIONAL_DSP_POPULARITY: Record<string, readonly string[]> = {
  BR: ['spotify', 'youtube', 'apple_music', 'soundcloud'],
  DE: ['spotify', 'apple_music', 'youtube', 'soundcloud'],
  IN: ['youtube', 'spotify', 'apple_music', 'soundcloud'],
  JP: ['youtube', 'apple_music', 'spotify', 'soundcloud'],
  MX: ['spotify', 'youtube', 'apple_music', 'soundcloud'],
  US: ['spotify', 'apple_music', 'youtube', 'soundcloud'],
};

export const geoAwarePopularityIndex = (
  pid: string,
  countryCode?: string | null
): number => {
  const normalizedCountryCode = countryCode?.trim().toUpperCase();
  const countryOrder = normalizedCountryCode
    ? REGIONAL_DSP_POPULARITY[normalizedCountryCode]
    : undefined;

  if (countryOrder) {
    const countryIndex = countryOrder.indexOf(pid);
    if (countryIndex !== -1) {
      return countryIndex;
    }
  }

  return popularityIndex(pid);
};
