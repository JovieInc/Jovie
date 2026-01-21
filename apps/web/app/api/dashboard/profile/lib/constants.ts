/**
 * Profile Route Constants
 *
 * Shared constants for the profile API route handlers.
 */

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const ALLOWED_PROFILE_FIELDS = new Set([
  'username',
  'displayName',
  'bio',
  'creatorType',
  'avatarUrl',
  'spotifyUrl',
  'appleMusicUrl',
  'youtubeUrl',
  'isPublic',
  'marketingOptOut',
  'settings',
  'theme',
  'venmo_handle',
]);
