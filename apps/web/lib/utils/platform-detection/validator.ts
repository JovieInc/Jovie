/**
 * URL Validator
 * Platform-specific URL validation rules
 */

import type { PlatformInfo } from './types';

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
const MAX_URL_LENGTH = 2048;

/**
 * Platforms that require a handle/username in the path
 */
const PLATFORMS_REQUIRING_HANDLE = new Set([
  'instagram',
  'twitter',
  'tiktok',
  'facebook',
  'linkedin',
  'venmo',
  'soundcloud',
  'twitch',
  'threads',
  'snapchat',
  'discord',
  'telegram',
  'reddit',
  'pinterest',
  'onlyfans',
  'linktree',
  'bandcamp',
  'line',
  'viber',
  'rumble',
  'youtube',
]);

/**
 * Reserved YouTube paths
 */
const YOUTUBE_RESERVED_PATHS = new Set([
  'watch',
  'results',
  'shorts',
  'live',
  'playlist',
  'feed',
  'gaming',
  'music',
  'premium',
  'embed',
  'c',
  'channel',
  'user',
]);

/**
 * Friendly error messages per platform
 */
export const PLATFORM_ERROR_EXAMPLES: Record<string, string> = {
  spotify: 'Add your artist ID. Example: https://open.spotify.com/artist/1234',
  instagram: 'Add your username. Example: https://instagram.com/username',
  tiktok: 'Add your username. Example: https://tiktok.com/@username',
  youtube: 'Add your handle. Example: https://youtube.com/@handle',
  twitter: 'Add your username. Example: https://x.com/username',
  venmo: 'Add your username. Example: https://venmo.com/username',
  facebook: 'Add your page name. Example: https://facebook.com/pagename',
  linkedin: 'Add your profile. Example: https://linkedin.com/in/username',
  soundcloud: 'Add your username. Example: https://soundcloud.com/username',
  twitch: 'Add your username. Example: https://twitch.tv/username',
  threads: 'Add your username. Example: https://threads.net/@username',
  snapchat: 'Add your username. Example: https://snapchat.com/add/username',
  discord: 'Add your invite code. Example: https://discord.gg/invitecode',
  telegram: 'Add your username. Example: https://t.me/username',
  reddit: 'Add your username. Example: https://reddit.com/u/username',
  pinterest: 'Add your username. Example: https://pinterest.com/username',
  onlyfans: 'Add your username. Example: https://onlyfans.com/username',
  linktree: 'Add your username. Example: https://linktr.ee/username',
  bandcamp: 'Add your subdomain. Example: https://username.bandcamp.com',
};

/**
 * Validate YouTube URL format
 */
function validateYouTubeUrl(url: string): boolean {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  const parts = path.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    return /^\/[A-Za-z0-9_-]{6,}/.test(path);
  }

  if (host === 'youtube.com') {
    if (/^\/(c|channel|user)\/[A-Za-z0-9_-]+/.test(path)) return true;
    if (/^\/@[A-Za-z0-9._-]+/.test(path)) return true;
    if (/^\/shorts\/[A-Za-z0-9_-]+/.test(path)) return true;
    if (u.searchParams.get('v')) return true; // watch?v=
    if (
      parts.length === 1 &&
      !YOUTUBE_RESERVED_PATHS.has(parts[0].toLowerCase())
    ) {
      return true; // legacy custom URL like /timwhite
    }
  }

  return false;
}

/**
 * Check if URL has a valid handle in path
 */
function hasValidHandle(url: string): boolean {
  const pathParts = new URL(url).pathname.split('/').filter(Boolean);
  const last = pathParts[pathParts.length - 1] ?? '';
  // must have at least one non-separator character (not just @)
  return !!last.replace(/^@/, '').trim();
}

/**
 * Validate URL format for specific platform
 */
export function validateUrl(url: string, platform: PlatformInfo): boolean {
  try {
    const lowered = url.trim().toLowerCase();
    if (lowered.length > MAX_URL_LENGTH) {
      return false;
    }

    // Check for dangerous schemes
    if (DANGEROUS_SCHEMES.some(scheme => lowered.startsWith(scheme))) {
      return false;
    }

    // Check for encoded control characters
    if (ENCODED_CONTROL_PATTERN.test(lowered)) {
      return false;
    }

    new URL(url); // Basic URL validation

    // Check if platform requires a handle
    if (PLATFORMS_REQUIRING_HANDLE.has(platform.id)) {
      if (!hasValidHandle(url)) {
        return false;
      }
    }

    // Platform-specific validation rules
    switch (platform.id) {
      case 'spotify':
        return /open\.spotify\.com\/(artist|album|track|playlist)\/[a-zA-Z0-9]+/.test(
          url
        );
      case 'instagram':
        return /instagram\.com\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'twitter':
        return /(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'tiktok':
        return /tiktok\.com\/@[a-zA-Z0-9._]+\/?$/.test(url);
      case 'youtube':
        return validateYouTubeUrl(url);
      case 'venmo':
        return /venmo\.com\/[a-zA-Z0-9_-]+\/?$/.test(url);
      case 'facebook':
        return /facebook\.com\/[a-zA-Z0-9._-]+\/?$/.test(url);
      case 'linkedin':
        return /linkedin\.com\/(in|company)\/[a-zA-Z0-9_-]+\/?$/.test(url);
      case 'soundcloud':
        return /soundcloud\.com\/[a-zA-Z0-9_-]+\/?/.test(url);
      case 'twitch':
        return /twitch\.tv\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'threads':
        return /threads\.net\/@[a-zA-Z0-9._]+\/?$/.test(url);
      case 'snapchat':
        return /snapchat\.com\/add\/[a-zA-Z0-9._-]+\/?$/.test(url);
      case 'discord':
        return /discord\.(gg|com\/invite)\/[a-zA-Z0-9]+\/?$/.test(url);
      case 'telegram':
        return /(t\.me|telegram\.me)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'reddit':
        return /reddit\.com\/(r|u|user)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'pinterest':
        return /pinterest\.com\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'onlyfans':
        return /onlyfans\.com\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'linktree':
        return /linktr\.ee\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'bandcamp':
        return /[a-zA-Z0-9_-]+\.bandcamp\.com\/?/.test(url);
      default:
        return true; // Basic URL validation passed for unknown platforms
    }
  } catch {
    return false;
  }
}

/**
 * Get error message for a platform validation failure
 */
export function getValidationError(platformId: string): string {
  return PLATFORM_ERROR_EXAMPLES[platformId] || 'Invalid URL format';
}
