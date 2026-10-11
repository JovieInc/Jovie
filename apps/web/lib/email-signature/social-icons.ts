/**
 * Maps a normalized social platform to its hosted PNG icon URL for email
 * signatures. Returns `null` for platforms without a brand icon so the
 * caller can fall back to a labeled text link.
 *
 * `EMAIL_SIGNATURE_ICON_KEYS` mirrors the normalized keys of the canonical
 * `SOCIAL_ICON_DATA` registry (`lib/social-icons/icon-data.ts`) — the PNG
 * generator (`scripts/generate-email-signature-icons.ts`) emits one
 * `<key>.png` per key, and a unit test asserts this list stays in sync.
 * Keeping a plain key list here avoids bundling the full icon path data
 * into the client signature builder.
 */

import { BASE_URL } from '@/constants/domains';
import { normalizeSocialIconKey } from '@/lib/social-icons/normalize';

import { EMAIL_SIGNATURE_ICON_BASE_PATH } from './icon-path';

const EMAIL_SIGNATURE_ICON_KEYS: ReadonlySet<string> = new Set([
  'allmusic',
  'amazon',
  'amazonmusic',
  'anghami',
  'apple',
  'applemusic',
  'audiomack',
  'audius',
  'awa',
  'bandcamp',
  'beatport',
  'behance',
  'boomplay',
  'deezer',
  'discogs',
  'discord',
  'dribbble',
  'email',
  'facebook',
  'flo',
  'gaana',
  'genius',
  'github',
  'iheartradio',
  'instagram',
  'jiosaavn',
  'joox',
  'kkbox',
  'line',
  'linemusic',
  'linkedin',
  'mail',
  'medium',
  'musicbrainz',
  'napster',
  'neteasemusic',
  'onlyfans',
  'pandora',
  'patreon',
  'phone',
  'pinterest',
  'qobuz',
  'qqmusic',
  'quora',
  'reddit',
  'rumble',
  'signal',
  'snapchat',
  'soundcloud',
  'spotify',
  'substack',
  'telegram',
  'threads',
  'tidal',
  'tiktok',
  'trebel',
  'tumblr',
  'twitch',
  'twitter',
  'venmo',
  'viber',
  'vimeo',
  'website',
  'whatsapp',
  'x',
  'yandexmusic',
  'youtube',
  'youtubemusic',
]);

/**
 * Resolve a platform id/name to its email-signature icon key, or `null`
 * when the platform has no brand icon.
 */
export function getEmailSignatureIconKey(platform: string): string | null {
  const key = normalizeSocialIconKey(platform);
  return key && EMAIL_SIGNATURE_ICON_KEYS.has(key) ? key : null;
}

/**
 * Absolute https URL of the hosted PNG icon for a platform, or `null`.
 */
export function getEmailSignatureIconUrl(platform: string): string | null {
  const key = getEmailSignatureIconKey(platform);
  if (!key) return null;
  return `${BASE_URL}${EMAIL_SIGNATURE_ICON_BASE_PATH}/${key}.png`;
}
