/**
 * Visitor signal resolvers for the one-right-thing engine.
 *
 * Everything here reads only what a browser already sends with the request or
 * what the edge stamped in the essential `jv_country` cookie: the referrer,
 * the user agent, `utm_source`, the country. None of it needs non-essential
 * cookies. The one stored signal, "returning visitor", is read only when the
 * caller says consent allows it, and is `null` (unknown) otherwise.
 *
 * Coverage caveat: referrers are stripped by many apps and in-app browsers,
 * and the Spotify webview user agent is matched on its product token only.
 * `direct` therefore means "no usable source", not "typed the URL".
 */

import type {
  InAppBrowser,
  VisitorChannel,
  VisitorDevice,
  VisitorSignals,
  VisitorSource,
} from './engine';

const DSP_NAMES = new Set([
  'spotify',
  'apple_music',
  'youtube_music',
  'deezer',
  'tidal',
  'amazon_music',
  'soundcloud',
  'bandcamp',
]);

const SOCIAL_NAMES = new Set([
  'instagram',
  'facebook',
  'tiktok',
  'twitter',
  'threads',
  'youtube',
  'snapchat',
  'reddit',
  'whatsapp',
]);

const SEARCH_NAMES = new Set(['google', 'bing', 'duckduckgo', 'yahoo']);

const HOST_TO_NAME: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)spotify\.com$|(^|\.)spotify\.link$/u, 'spotify'],
  [/(^|\.)music\.apple\.com$|(^|\.)itunes\.apple\.com$/u, 'apple_music'],
  [/(^|\.)music\.youtube\.com$/u, 'youtube_music'],
  [/(^|\.)deezer\.com$/u, 'deezer'],
  [/(^|\.)tidal\.com$/u, 'tidal'],
  [/(^|\.)music\.amazon\.[a-z.]+$/u, 'amazon_music'],
  [/(^|\.)soundcloud\.com$/u, 'soundcloud'],
  [/(^|\.)bandcamp\.com$/u, 'bandcamp'],
  [/(^|\.)instagram\.com$/u, 'instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/u, 'facebook'],
  [/(^|\.)tiktok\.com$/u, 'tiktok'],
  [/(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)t\.co$/u, 'twitter'],
  [/(^|\.)threads\.net$/u, 'threads'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/u, 'youtube'],
  [/(^|\.)snapchat\.com$/u, 'snapchat'],
  [/(^|\.)reddit\.com$/u, 'reddit'],
  [/(^|\.)whatsapp\.com$|(^|\.)wa\.me$/u, 'whatsapp'],
  [/(^|\.)google\.[a-z.]+$/u, 'google'],
  [/(^|\.)bing\.com$/u, 'bing'],
  [/(^|\.)duckduckgo\.com$/u, 'duckduckgo'],
  [/(^|\.)yahoo\.com$/u, 'yahoo'],
];

function channelFor(name: string): VisitorChannel {
  if (DSP_NAMES.has(name)) return 'dsp';
  if (SOCIAL_NAMES.has(name)) return 'social';
  if (SEARCH_NAMES.has(name)) return 'search';
  return 'other';
}

function normalizeUtmSource(raw: string): string {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, '_');
  if (value === 'ig') return 'instagram';
  if (value === 'fb') return 'facebook';
  if (value === 'apple' || value === 'applemusic') return 'apple_music';
  if (value === 'youtubemusic') return 'youtube_music';
  if (value === 'x') return 'twitter';
  return value.slice(0, 32);
}

/**
 * Source of the visit. An explicit `utm_source` wins over the referrer, since
 * it is what the artist or campaign asserted. A referrer on the profile's own
 * host (navigation inside Jovie) is ignored.
 */
export function classifyVisitorSource(input: {
  readonly referrer: string | null | undefined;
  readonly search: string | null | undefined;
  readonly ownHost?: string | null;
}): VisitorSource {
  const utm = new URLSearchParams(input.search ?? '').get('utm_source');
  if (utm && utm.trim() !== '') {
    const name = normalizeUtmSource(utm);
    return { channel: channelFor(name), name };
  }

  if (!input.referrer) return { channel: 'direct', name: null };
  let host: string;
  try {
    host = new URL(input.referrer).hostname.toLowerCase();
  } catch {
    return { channel: 'direct', name: null };
  }
  const own = input.ownHost?.toLowerCase();
  if (own && (host === own || host.endsWith(`.${own}`))) {
    return { channel: 'direct', name: null };
  }
  for (const [pattern, name] of HOST_TO_NAME) {
    if (pattern.test(host)) return { channel: channelFor(name), name };
  }
  return { channel: 'other', name: null };
}

export function detectInAppBrowser(
  userAgent: string | null | undefined
): InAppBrowser | null {
  const ua = userAgent ?? '';
  if (/\bInstagram\b/u.test(ua)) return 'instagram';
  if (/\bFBAN\b|\bFBAV\b|\bFB_IAB\b/u.test(ua)) return 'facebook';
  if (/musical_ly|\bBytedance\b|\bTikTok\b/iu.test(ua)) return 'tiktok';
  if (/\bSpotify\b/u.test(ua)) return 'spotify';
  if (/\bLine\/|\bSnapchat\b|\bTwitter for\b/u.test(ua)) return 'other';
  return null;
}

export function detectDevice(
  userAgent: string | null | undefined
): VisitorDevice {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/u.test(ua)) return 'ios';
  if (/Android/u.test(ua)) return 'android';
  return 'desktop';
}

/** Accepts only a two letter code; anything else is unknown. */
export function normalizeCountry(
  value: string | null | undefined
): string | null {
  const code = (value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code) || code === 'XX' || code === 'T1') return null;
  return code;
}

export interface RawVisitorEnvironment {
  readonly referrer: string | null | undefined;
  readonly search: string | null | undefined;
  readonly ownHost?: string | null;
  readonly userAgent: string | null | undefined;
  readonly countryCookie: string | null | undefined;
  /** True only when consent allows reading the returning-visitor marker. */
  readonly returningMarkerAllowed: boolean;
  readonly returningMarkerPresent: boolean;
  readonly now: Date;
}

export function resolveVisitorSignals(
  env: RawVisitorEnvironment
): VisitorSignals {
  return {
    source: classifyVisitorSource(env),
    inApp: detectInAppBrowser(env.userAgent),
    country: normalizeCountry(env.countryCookie),
    device: detectDevice(env.userAgent),
    returning: env.returningMarkerAllowed ? env.returningMarkerPresent : null,
    now: env.now,
  };
}

/** The signals every first (server-equivalent) render uses: no per-visitor input. */
export function neutralVisitorSignals(now: Date): VisitorSignals {
  return {
    source: { channel: 'direct', name: null },
    inApp: null,
    country: null,
    device: 'desktop',
    returning: null,
    now,
  };
}
