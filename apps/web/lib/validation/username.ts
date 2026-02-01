/**
 * Server-side username validation and normalization.
 *
 * Uses shared validation core for consistency with client-side validation.
 */

import {
  type DetailedValidationResult,
  isUsernameFormatValid,
  validateUsernameCore,
} from './username-core';

// Re-export core constants and types for backwards compatibility
export {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './username-core';

export interface UsernameValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a username against all rules.
 * Server-side wrapper around the core validation function.
 *
 * @param username - The username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): UsernameValidationResult {
  const result: DetailedValidationResult = validateUsernameCore(username);

  if (result.isValid) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: result.error,
  };
}

/**
 * Normalize a username for storage.
 *
 * @param username - The username to normalize
 * @returns Normalized username (lowercase, trimmed)
 */
export { normalizeUsername } from './username-core';

/**
 * Check if a username is available (client-side pre-check).
 * This doesn't check the database, just validates format and reserved words.
 *
 * @param username - The username to check
 * @returns True if username passes all validation rules
 */
export function isUsernameAvailable(username: string): boolean {
  return isUsernameFormatValid(username);
}
