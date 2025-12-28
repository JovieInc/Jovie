/**
 * Email utility functions
 *
 * Centralized email normalization and validation to avoid duplication.
 */

/**
 * Normalize an email address for consistent storage and comparison
 *
 * @param email - The email address to normalize
 * @returns Normalized email (trimmed and lowercased)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * RFC 5322 compliant email regex for strict validation
 * Use this for user-facing email inputs that need thorough validation
 */
export const EMAIL_REGEX_STRICT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Simple email regex for basic validation
 * Use this for quick checks where strict RFC compliance isn't required
 */
export const EMAIL_REGEX_SIMPLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate an email address using strict RFC 5322 compliant regex
 *
 * @param email - The email address to validate
 * @returns True if the email is valid
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX_STRICT.test(email);
}

/**
 * Validate an email address using simple regex (less strict)
 *
 * @param email - The email address to validate
 * @returns True if the email passes basic format check
 */
export function isValidEmailSimple(email: string): boolean {
  return EMAIL_REGEX_SIMPLE.test(email);
}
