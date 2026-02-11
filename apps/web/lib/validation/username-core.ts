/**
 * Core username validation logic shared between client and server.
 * Single source of truth for username rules and reserved words.
 */

import { checkContent } from './content-filter';

// ============================================================================
// Constants
// ============================================================================

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Comprehensive list of reserved usernames.
 * Includes system routes, legal pages, features, and common reserved words.
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
  'app',
  'notify',
  'clerk',
  'mail',
  'changelog',
  'engagement-engine',
  'link-in-bio',

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
  'prod',
  'dev',
  'development',
  'preview',
  'beta',
  'alpha',
  'stage',

  // Common reserved
  'www',
  'ftp',
  'email',
  'smtp',
  'pop',
  'imap',
  'http',
  'https',
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
  'root',

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

// Set for O(1) lookups
const RESERVED_SET = new Set(RESERVED_USERNAMES.map(u => u.toLowerCase()));

// ============================================================================
// Types
// ============================================================================

export interface UsernameValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
}

export type UsernameValidationErrorCode =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_CHARS'
  | 'STARTS_WITH_NUMBER_OR_HYPHEN'
  | 'ENDS_WITH_HYPHEN'
  | 'CONSECUTIVE_HYPHENS'
  | 'RESERVED'
  | 'RESERVED_PATTERN'
  | 'INAPPROPRIATE_CONTENT';

export interface DetailedValidationResult {
  isValid: boolean;
  errorCode?: UsernameValidationErrorCode;
  error?: string;
  suggestion?: string;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Create validation error result.
 * Eliminates duplication in error return statements.
 */
function createValidationError(
  errorCode: UsernameValidationErrorCode,
  error: string,
  suggestion?: string
): DetailedValidationResult {
  return { isValid: false, errorCode, error, suggestion };
}

/**
 * Validates a username against all rules.
 * This is the core validation function used by both client and server.
 *
 * @param username - The username to validate
 * @returns Detailed validation result with error code and message
 */
export function validateUsernameCore(
  username: string
): DetailedValidationResult {
  // Check if empty
  if (!username || username.trim() === '') {
    return createValidationError('EMPTY', 'Username is required');
  }

  // Normalize username
  const normalized = username.toLowerCase().trim();

  // Check length
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return createValidationError(
      'TOO_SHORT',
      `Handle must be at least ${USERNAME_MIN_LENGTH} characters`
    );
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return createValidationError(
      'TOO_LONG',
      `Handle must be no more than ${USERNAME_MAX_LENGTH} characters`
    );
  }

  // Check pattern (alphanumeric and hyphen only)
  if (!USERNAME_PATTERN.test(normalized)) {
    return createValidationError(
      'INVALID_CHARS',
      'Handle can only contain letters, numbers, and hyphens'
    );
  }

  // Check if starts with number or hyphen
  if (/^[0-9-]/.test(normalized)) {
    return createValidationError(
      'STARTS_WITH_NUMBER_OR_HYPHEN',
      'Handle must start with a letter'
    );
  }

  // Check if ends with hyphen
  if (normalized.endsWith('-')) {
    return createValidationError(
      'ENDS_WITH_HYPHEN',
      'Handle cannot end with a hyphen'
    );
  }

  // Check for consecutive hyphens
  if (normalized.includes('--')) {
    return createValidationError(
      'CONSECUTIVE_HYPHENS',
      'Handle cannot contain consecutive hyphens'
    );
  }

  // Check reserved words
  if (RESERVED_SET.has(normalized)) {
    return createValidationError(
      'RESERVED',
      'This handle is reserved and cannot be used',
      `${username}-artist`
    );
  }

  // Check if it's a reserved pattern (e.g., starts with reserved word)
  const startsWithReserved = RESERVED_USERNAMES.some(
    reserved =>
      normalized.startsWith(reserved + '_') ||
      normalized.startsWith(reserved + '-')
  );

  if (startsWithReserved) {
    return createValidationError(
      'RESERVED_PATTERN',
      'This username pattern is reserved'
    );
  }

  // Check for inappropriate/non-SEO-safe content
  const contentCheck = checkContent(normalized);
  if (!contentCheck.isClean) {
    return createValidationError(
      'INAPPROPRIATE_CONTENT',
      contentCheck.error ?? 'This handle contains language that is not allowed'
    );
  }

  return { isValid: true };
}

/**
 * Normalizes a username for storage.
 * Lowercases and trims whitespace.
 *
 * @param username - The username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

/**
 * Quick check if a username is potentially valid (format only).
 * Does not check against database availability.
 *
 * @param username - The username to check
 * @returns True if username passes all validation rules
 */
export function isUsernameFormatValid(username: string): boolean {
  return validateUsernameCore(username).isValid;
}

/**
 * Generates username suggestions based on input.
 *
 * @param baseUsername - The base username to generate suggestions from
 * @param artistName - Optional artist name for additional suggestions
 * @returns Array of valid username suggestions
 */
export function generateUsernameSuggestions(
  baseUsername: string,
  artistName?: string
): string[] {
  const suggestions: string[] = [];
  if (!baseUsername) return suggestions;
  const base = baseUsername.toLowerCase().replaceAll(/[^a-z0-9-]/g, '');

  if (artistName) {
    const artistSlug = artistName
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/(^-)|(-$)/g, '');

    if (artistSlug) {
      suggestions.push(
        artistSlug,
        `${artistSlug}-music`,
        `${artistSlug}-official`
      );
    }
  }

  if (base) {
    suggestions.push(`${base}-music`, `${base}-official`, `${base}-artist`);

    // Add numbered variations
    for (let i = 1; i <= 3; i++) {
      suggestions.push(`${base}${i}`);
    }
  }

  // Remove duplicates and filter out invalid suggestions
  return [...new Set(suggestions)]
    .filter(suggestion => isUsernameFormatValid(suggestion))
    .slice(0, 5);
}
