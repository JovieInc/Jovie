/**
 * URL Normalizer
 * Handles URL cleaning, typo correction, and normalization
 */

import { DOMAIN_MISSPELLINGS } from './registry';

/**
 * URL dot-fix patterns for common typos
 * Fixes missing dots before TLDs for common platforms
 */
const DOT_FIX_PATTERNS: Array<[RegExp, string]> = [
  // Fix .ocm typo to .com
  [/\.ocm(\/|$)/gi, '.com$1'],
  // Fix missing dots before TLDs
  [/\b(youtube)com\b/i, '$1.com'],
  [/\b(instagram)com\b/i, '$1.com'],
  [/\b(tiktok)com\b/i, '$1.com'],
  [/\b(twitter)com\b/i, '$1.com'],
  [/\b(facebook)com\b/i, '$1.com'],
  [/\b(soundcloud)com\b/i, '$1.com'],
  [/\b(bandcamp)com\b/i, '$1.com'],
  [/\b(spotify)com\b/i, '$1.com'],
  [/\b(venmo)com\b/i, '$1.com'],
  [/\b(linkedin)com\b/i, '$1.com'],
  [/\b(pinterest)com\b/i, '$1.com'],
  [/\b(reddit)com\b/i, '$1.com'],
  [/\b(onlyfans)com\b/i, '$1.com'],
  [/\b(quora)com\b/i, '$1.com'],
  [/\b(threads)net\b/i, '$1.net'],
  [/\b(twitch)tv\b/i, '$1.tv'],
  [/\b(rumble)com\b/i, '$1.com'],
  [/\b(telegram)me\b/i, '$1.me'],
  [/\b(telegram)com\b/i, '$1.com'],
  [/\b(line)me\b/i, '$1.me'],
  [/\b(viber)com\b/i, '$1.com'],
  // Short domains / special cases
  [/\b(discord)gg\b/i, '$1.gg'],
  [/\b(t)me\b/i, '$1.me'],
  // With spaces or commas before TLDs
  [
    /\b(youtube|instagram|tiktok|twitter|facebook|soundcloud|bandcamp|spotify|venmo|linkedin|pinterest|reddit|onlyfans|quora|rumble)[\s,]+com\b/gi,
    '$1.com',
  ],
  [/\b(threads)[\s,]+net\b/gi, '$1.net'],
  [/\b(twitch)[\s,]+tv\b/gi, '$1.tv'],
  [/\b(youtu)[\s,]+be\b/gi, '$1.be'],
  [/\b(discord)[\s,]+gg\b/gi, '$1.gg'],
  [/\b(t)[\s,]+me\b/gi, '$1.me'],
];

/**
 * Tracking parameters to remove from URLs
 */
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
  '_ga',
  'ref',
  'source',
];

const MAX_URL_LENGTH = 2048;

/**
 * Dangerous URL schemes that should be rejected
 */
const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'mailto:',
];

/**
 * Pattern to detect encoded control characters
 */
const ENCODED_CONTROL_PATTERN = /%(0a|0d|09|00)/i;

/**
 * Reserved TikTok paths that shouldn't be prefixed with @
 */
const TIKTOK_RESERVED_PATHS = new Set([
  'for',
  'following',
  'live',
  'upload',
  'search',
  'discover',
  'trending',
]);

/**
 * Check if a URL contains dangerous schemes or encoded control characters
 */
export function isUnsafeUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase();

  if (DANGEROUS_SCHEMES.some(scheme => lowered.startsWith(scheme))) {
    return true;
  }

  if (ENCODED_CONTROL_PATTERN.test(lowered)) {
    return true;
  }

  return false;
}

/**
 * Fix common domain misspellings in a URL
 */
function fixDomainMisspellings(url: string): string {
  for (const [misspelled, correct] of Object.entries(DOMAIN_MISSPELLINGS)) {
    const regex = new RegExp(misspelled.replaceAll('.', '\\.'), 'gi');
    url = url.replaceAll(regex, correct);
  }
  return url;
}

/**
 * Fix missing dots before TLDs
 */
function fixMissingDots(url: string): string {
  for (const [pattern, replacement] of DOT_FIX_PATTERNS) {
    url = url.replace(pattern, replacement);
  }
  return url;
}

/**
 * Remove tracking parameters from URL
 */
function removeTrackingParams(parsedUrl: URL): void {
  TRACKING_PARAMS.forEach(param => {
    parsedUrl.searchParams.delete(param);
  });
}

/**
 * Normalize TikTok URLs by adding @ to usernames if missing
 */
function normalizeTikTokPath(parsedUrl: URL): void {
  if (!/(?:www\.)?tiktok\.com/i.test(parsedUrl.hostname)) {
    return;
  }

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

  if (
    pathParts.length > 0 &&
    !pathParts[0].startsWith('@') &&
    !TIKTOK_RESERVED_PATHS.has(pathParts[0].toLowerCase()) &&
    /^[a-zA-Z0-9._]+$/.test(pathParts[0])
  ) {
    pathParts[0] = '@' + pathParts[0];
    parsedUrl.pathname = '/' + pathParts.join('/');
  }
}

/**
 * Canonicalize Twitter domain to x.com
 */
function canonicalizeTwitterDomain(parsedUrl: URL): void {
  if (/^(?:www\.)?twitter\.com$/i.test(parsedUrl.hostname)) {
    parsedUrl.hostname = 'x.com';
  }
}

/**
 * Normalize a URL by cleaning UTM parameters and enforcing HTTPS
 */
export function normalizeUrl(url: string): string {
  try {
    const trimmed = url.trim();
    if (trimmed.length > MAX_URL_LENGTH) {
      return trimmed;
    }

    const lowered = trimmed.toLowerCase();

    if (isUnsafeUrl(lowered)) {
      throw new Error('Unsafe URL');
    }

    // Normalize stray spaces around dots
    url = trimmed.replaceAll(/\s*\.\s*/g, '.');

    // Fix common domain misspellings
    url = fixDomainMisspellings(url);

    // Comma instead of dot before common TLDs (e.g., youtube,com)
    url = url.replaceAll(/,(?=\s*(com|net|tv|be|gg|me)\b)/gi, '.');

    // Fix missing dots before TLDs
    url = fixMissingDots(url);

    // Support bare X (Twitter) handles like @username
    if (/^@[a-zA-Z0-9._]+$/.test(url)) {
      return `https://x.com/${url.slice(1)}`;
    }

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const parsedUrl = new URL(url);

    // Force HTTPS for known platforms
    parsedUrl.protocol = 'https:';

    // Canonicalize Twitter domain to x.com
    canonicalizeTwitterDomain(parsedUrl);

    // Normalize TikTok paths
    normalizeTikTokPath(parsedUrl);

    // Remove tracking parameters
    removeTrackingParams(parsedUrl);

    return parsedUrl.toString();
  } catch {
    return url; // Return original if URL parsing fails
  }
}
