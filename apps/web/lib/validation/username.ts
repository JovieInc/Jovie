/**
 * Username Validation
 *
 * @deprecated Import from '@/lib/validation/schemas' instead.
 * This file re-exports from the unified validation schema for backwards compatibility.
 */

export {
  // Constants
  RESERVED_USERNAMES,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  // Functions
  validateUsername,
  isReservedUsername,
  // Types
  type UsernameValidationResult,
} from './schemas/username';

/**
 * Normalize a username for storage.
 *
 * @param username - The username to normalize
 * @returns Normalized username (lowercase, trimmed)
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

/**
 * Check if a username is available (client-side pre-check).
 * This doesn't check the database, just validates format and reserved words.
 *
 * @param username - The username to check
 * @returns True if username passes all validation rules
 */
export function isUsernameAvailable(username: string): boolean {
  const { validateUsername: validate } = require('./schemas/username');
  const validation = validate(username);
  return validation.isValid;
}
