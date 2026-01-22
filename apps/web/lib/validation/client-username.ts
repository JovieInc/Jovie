/**
 * Client-side username validation for instant feedback.
 * Reduces validation response time from 500ms+ to <50ms.
 *
 * Uses shared validation core for consistency with server-side validation.
 */

import {
  type DetailedValidationResult,
  generateUsernameSuggestions as generateSuggestions,
  validateUsernameCore,
} from './username-core';

// Re-export core constants for backwards compatibility
export {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './username-core';

export interface ClientValidationResult {
  valid: boolean;
  error: string | null;
  suggestion?: string;
}

/**
 * Instant client-side username validation.
 * Provides immediate feedback without API calls.
 *
 * @param username - The username to validate
 * @returns Validation result with error message and optional suggestion
 */
export function validateUsernameFormat(
  username: string
): ClientValidationResult {
  // Empty username returns valid: false with no error (user hasn't typed yet)
  if (!username) {
    return { valid: false, error: null };
  }

  const result: DetailedValidationResult = validateUsernameCore(username);

  if (result.isValid) {
    return { valid: true, error: null };
  }

  return {
    valid: false,
    error: result.error ?? 'Invalid username',
    suggestion: result.suggestion,
  };
}

/**
 * Generate username suggestions based on input.
 * Re-exported from core for client-side use.
 */
export const generateUsernameSuggestions = generateSuggestions;
