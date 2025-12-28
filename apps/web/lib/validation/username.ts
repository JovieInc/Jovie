/**
 * Username validation and reserved words checking
 */

import {
  isReservedUsername,
  startsWithReservedPattern,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './username-constants';

export interface UsernameValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate a username against all rules
 *
 * @param username - The username to validate
 * @returns Validation result with error message if invalid
 */
export function validateUsername(username: string): UsernameValidationResult {
  // Check if empty
  if (!username || username.trim() === '') {
    return { isValid: false, error: 'Username is required' };
  }

  // Normalize username
  const normalized = username.toLowerCase().trim();

  // Check length
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Username must be no more than ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  // Check pattern (alphanumeric and hyphen only)
  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      isValid: false,
      error: 'Username can only contain letters, numbers, and hyphens',
    };
  }

  // Check if starts with number or hyphen
  if (/^[0-9-]/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username must start with a letter',
    };
  }

  // Check if ends with hyphen
  if (/-$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username cannot end with a hyphen',
    };
  }

  // Check for consecutive hyphens
  if (/--/.test(normalized)) {
    return {
      isValid: false,
      error: 'Username cannot contain consecutive hyphens',
    };
  }

  // Check reserved words
  if (isReservedUsername(normalized)) {
    return {
      isValid: false,
      error: 'This username is reserved and cannot be used',
    };
  }

  // Check if it's a reserved pattern (e.g., starts with reserved word)
  if (startsWithReservedPattern(normalized)) {
    return {
      isValid: false,
      error: 'This username pattern is reserved',
    };
  }

  return { isValid: true };
}

/**
 * Normalize a username for storage
 *
 * @param username - The username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim();
}

/**
 * Check if a username is available (client-side pre-check)
 * This doesn't check the database, just validates format and reserved words
 *
 * @param username - The username to check
 * @returns True if username passes all validation rules
 */
export function isUsernameAvailable(username: string): boolean {
  const validation = validateUsername(username);
  return validation.isValid;
}
