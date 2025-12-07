import { publicEnv } from '@/lib/env-public';

export const APP_NAME = 'Jovie';
export const APP_URL = publicEnv.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie';
export const MAX_SOCIAL_LINKS = 6;
export const LISTEN_COOKIE = 'jovie_dsp';
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
} as const;
export const DEFAULT_PROFILE_TAGLINE = 'Artist';
export const PAGE_SUBTITLES = {
  profile: 'Artist',
  tip: 'Tip with Venmo',
  listen: 'Choose a Service',
  subscribe: 'Get notified',
} as const;

// Legacy FEATURE_FLAGS removed (waitlist deprecated). Use `lib/feature-flags.ts`.

export const LEGAL = {
  privacyPath: '/legal/privacy',
  termsPath: '/legal/terms',
};

export const COPYRIGHT_YEAR = new Date().getFullYear();
export const getCopyrightText = (year?: number) =>
  `© ${year ?? COPYRIGHT_YEAR} ${APP_NAME}`;

export const SOCIAL_PLATFORMS = [
  'instagram',
  'twitter',
  'tiktok',
  'youtube',
  'facebook',
  'spotify',
  'apple_music',
  'website',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
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
