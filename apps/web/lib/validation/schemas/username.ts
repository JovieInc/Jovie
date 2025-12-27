/**
 * Username Validation Schema
 *
 * Single source of truth for username validation.
 * Uses Zod for type-safe, isomorphic validation.
 */

import { z } from 'zod';

/**
 * Reserved usernames that cannot be used.
 * This is the comprehensive list - all systems must use this.
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
  'stage',
  'prod',

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

export type ReservedUsername = (typeof RESERVED_USERNAMES)[number];

/** Minimum username length */
export const USERNAME_MIN_LENGTH = 3;

/** Maximum username length */
export const USERNAME_MAX_LENGTH = 30;

/** Pattern for valid username characters */
export const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z]$/;

/** Pattern to check for consecutive hyphens */
const CONSECUTIVE_HYPHENS = /--/;

/**
 * Check if a username is reserved.
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(
    username.toLowerCase() as ReservedUsername
  );
}

/**
 * Username validation schema.
 *
 * Rules:
 * - 3-30 characters
 * - Letters, numbers, and hyphens only
 * - Must start with a letter
 * - Cannot end with a hyphen
 * - No consecutive hyphens
 * - Not a reserved word
 *
 * @example
 * ```ts
 * import { usernameSchema } from '@/lib/validation/schemas/username';
 *
 * const result = usernameSchema.safeParse('my-username');
 * if (!result.success) {
 *   console.error(result.error.issues[0].message);
 * }
 * ```
 */
export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, {
    message: `Handle must be at least ${USERNAME_MIN_LENGTH} characters`,
  })
  .max(USERNAME_MAX_LENGTH, {
    message: `Handle must be no more than ${USERNAME_MAX_LENGTH} characters`,
  })
  .regex(/^[a-zA-Z]/, {
    message: 'Handle must start with a letter',
  })
  .regex(/^[a-zA-Z0-9-]+$/, {
    message: 'Handle can only contain letters, numbers, and hyphens',
  })
  .refine((val) => !val.endsWith('-'), {
    message: 'Handle cannot end with a hyphen',
  })
  .refine((val) => !CONSECUTIVE_HYPHENS.test(val), {
    message: 'Handle cannot contain consecutive hyphens',
  })
  .refine((val) => !isReservedUsername(val), {
    message: 'This handle is reserved and cannot be used',
  })
  .transform((val) => val.toLowerCase());

/**
 * Type for a valid username after validation.
 */
export type Username = z.infer<typeof usernameSchema>;

/**
 * Validation result structure for backwards compatibility.
 */
export interface UsernameValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Validate a username.
 * Returns a result object for backwards compatibility with existing code.
 *
 * @param username - The username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): UsernameValidationResult {
  const result = usernameSchema.safeParse(username);

  if (result.success) {
    return {
      isValid: true,
      normalized: result.data,
    };
  }

  return {
    isValid: false,
    error: result.error.issues[0]?.message ?? 'Invalid username',
  };
}

/**
 * Client validation result structure.
 * Used for instant feedback without API calls.
 */
export interface ClientValidationResult {
  valid: boolean;
  error: string | null;
  suggestion?: string;
}

/**
 * Validate username format for instant client-side feedback.
 * Provides the same validation as the server without API calls.
 *
 * @param username - The username to validate
 * @returns Validation result with optional suggestion
 */
export function validateUsernameFormat(
  username: string
): ClientValidationResult {
  if (!username) {
    return { valid: false, error: null };
  }

  const result = validateUsername(username);

  if (result.isValid) {
    return { valid: true, error: null };
  }

  // Add suggestion for reserved usernames
  if (result.error?.includes('reserved')) {
    return {
      valid: false,
      error: result.error,
      suggestion: `${username}-artist`,
    };
  }

  return { valid: false, error: result.error ?? 'Invalid username' };
}

/**
 * Generate username suggestions based on input.
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
  const base = baseUsername.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (artistName) {
    const artistSlug = artistName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (artistSlug) {
      suggestions.push(artistSlug);
      suggestions.push(`${artistSlug}-music`);
      suggestions.push(`${artistSlug}-official`);
    }
  }

  if (base) {
    suggestions.push(`${base}-music`);
    suggestions.push(`${base}-official`);
    suggestions.push(`${base}-artist`);

    // Add numbered variations
    for (let i = 1; i <= 3; i++) {
      suggestions.push(`${base}${i}`);
    }
  }

  // Remove duplicates and filter out invalid suggestions
  return [...new Set(suggestions)]
    .filter((suggestion) => validateUsernameFormat(suggestion).valid)
    .slice(0, 5);
}
