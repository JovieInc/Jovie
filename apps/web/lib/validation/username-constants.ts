/**
 * Shared username validation constants
 *
 * Single source of truth for username validation rules.
 * Used by both server-side (username.ts) and client-side (client-username.ts) validation.
 */

/** Minimum username length */
export const USERNAME_MIN_LENGTH = 3;

/** Maximum username length */
export const USERNAME_MAX_LENGTH = 30;

/** Pattern for valid username characters (letters, numbers, hyphens) */
export const USERNAME_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Reserved usernames that cannot be used
 *
 * This list includes:
 * - System routes and pages
 * - Legal/company pages
 * - Feature-related paths
 * - Common infrastructure terms
 * - Social/community paths
 * - Account-related terms
 * - Music-specific terms
 * - Jovie-specific terms
 */
export const RESERVED_USERNAMES = [
  // System routes
  'api',
  'admin',
  'dashboard',
  'onboarding',
  'settings',
  'profile',
  'login',
  'signin',
  'signup',
  'signout',
  'logout',
  'register',
  'auth',
  'oauth',
  'callback',
  'verify',
  'reset',
  'forgot',

  // Legal/company pages
  'about',
  'contact',
  'privacy',
  'terms',
  'legal',
  'help',
  'support',
  'blog',
  'news',
  'press',
  'careers',
  'jobs',
  'team',
  'company',

  // Features
  'pricing',
  'features',
  'demo',
  'sandbox',
  'test',
  'staging',
  'production',
  'dev',
  'development',
  'preview',
  'beta',
  'alpha',

  // Common reserved
  'www',
  'mail',
  'ftp',
  'email',
  'smtp',
  'pop',
  'imap',
  'http',
  'https',
  'app',
  'mobile',
  'desktop',
  'download',
  'downloads',
  'assets',
  'static',
  'public',
  'private',
  'secure',
  'cdn',
  'media',
  'images',

  // Social/community
  'feed',
  'explore',
  'discover',
  'trending',
  'popular',
  'featured',
  'search',
  'find',
  'browse',
  'categories',
  'tags',
  'topics',

  // Account related
  'account',
  'accounts',
  'user',
  'users',
  'member',
  'members',
  'subscriber',
  'subscribers',
  'customer',
  'customers',
  'client',

  // Music specific
  'artist',
  'artists',
  'album',
  'albums',
  'track',
  'tracks',
  'playlist',
  'playlists',
  'genre',
  'genres',
  'charts',
  'top',

  // Jovie specific
  'jovie',
  'tip',
  'tips',
  'listen',
  'share',
  'link',
  'links',
  'bio',
  'waitlist',
  'invite',
  'invites',
  'referral',
  'refer',
] as const;

/** Type for reserved usernames */
export type ReservedUsername = (typeof RESERVED_USERNAMES)[number];

/**
 * Check if a username is in the reserved list
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(
    username.toLowerCase() as ReservedUsername
  );
}

/**
 * Check if username starts with a reserved pattern (reserved word + underscore or hyphen)
 */
export function startsWithReservedPattern(username: string): boolean {
  const normalized = username.toLowerCase();
  return RESERVED_USERNAMES.some(
    reserved =>
      normalized.startsWith(reserved + '_') ||
      normalized.startsWith(reserved + '-')
  );
}
