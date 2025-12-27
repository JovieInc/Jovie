/**
 * Validation Schemas
 *
 * Zod-based validation schemas for type-safe, isomorphic validation.
 * Import from here instead of individual files.
 */

export {
  // Schema
  usernameSchema,
  // Constants
  RESERVED_USERNAMES,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  // Functions
  isReservedUsername,
  validateUsername,
  validateUsernameFormat,
  generateUsernameSuggestions,
  // Types
  type ReservedUsername,
  type Username,
  type UsernameValidationResult,
  type ClientValidationResult,
} from './username';

// Re-export contact validation
export {
  normalizeEmail,
  normalizePhone,
  validateEmail,
  validatePhone,
  isValidEmail,
  isValidPhone,
  EMAIL_REGEX,
  SIMPLE_EMAIL_REGEX,
  EMAIL_MAX_LENGTH,
  PHONE_MAX_LENGTH,
} from '../contact';
