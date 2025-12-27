/**
 * Contact Validation Utilities
 *
 * Shared validation for email and phone across the application.
 * Uses RFC-compliant patterns for email and E.164 for phone numbers.
 */

/**
 * RFC 5322 compliant email regex.
 * More strict than simple @ check, validates proper format.
 */
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Simple email regex for quick validation.
 * Use EMAIL_REGEX for strict RFC compliance.
 */
export const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maximum allowed email length per RFC 5321 */
export const EMAIL_MAX_LENGTH = 254;

/** Maximum raw phone input length */
export const PHONE_MAX_LENGTH = 32;

/** Regex to detect control characters or whitespace */
const CONTROL_OR_SPACE_REGEX = /[\s\u0000-\u001F\u007F]/g;

/**
 * Validate and normalize an email address.
 * Returns null if invalid, lowercase email if valid.
 *
 * @param raw - Raw email input
 * @param options - Validation options
 * @returns Normalized email or null if invalid
 * @throws Error with user-friendly message if throwOnError is true
 */
export function normalizeEmail(
  raw: string | null | undefined,
  options: { throwOnError?: boolean; strict?: boolean } = {}
): string | null {
  const { throwOnError = false, strict = true } = options;

  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.length > EMAIL_MAX_LENGTH) {
    if (throwOnError) throw new Error('Email address is too long');
    return null;
  }

  if (CONTROL_OR_SPACE_REGEX.test(trimmed)) {
    if (throwOnError) throw new Error('Email contains invalid characters');
    return null;
  }

  const regex = strict ? EMAIL_REGEX : SIMPLE_EMAIL_REGEX;
  if (!regex.test(trimmed)) {
    if (throwOnError) throw new Error('Please enter a valid email address');
    return null;
  }

  return trimmed.toLowerCase();
}

/**
 * Normalize a phone number to E.164 format.
 * Handles various input formats:
 * - +1234567890
 * - 001234567890 (converts 00 prefix to +)
 * - 1234567890 (adds + prefix)
 *
 * @param raw - Raw phone input
 * @param options - Validation options
 * @returns E.164 formatted phone or null if invalid
 * @throws Error with user-friendly message if throwOnError is true
 */
export function normalizePhone(
  raw: string | null | undefined,
  options: { throwOnError?: boolean } = {}
): string | null {
  const { throwOnError = false } = options;

  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.length > PHONE_MAX_LENGTH) {
    if (throwOnError) throw new Error('Phone number is too long');
    return null;
  }

  // Remove all non-digit characters except leading +
  let normalized = trimmed.replace(/(?!^\+)[^\d]/g, '');

  // Handle 00 international prefix (convert to +)
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  // Add + if missing
  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  // Clean to only digits after the +
  normalized = `+${normalized.slice(1).replace(/\D/g, '')}`;

  // Validate E.164 format: +[country code 1-3 digits][subscriber number 6-12 digits]
  // Total: 7-15 digits after the +
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    if (throwOnError) throw new Error('Please enter a valid phone number');
    return null;
  }

  return normalized;
}

/**
 * Validate email address.
 * Convenience wrapper that throws on invalid input.
 *
 * @param email - Email to validate
 * @returns Normalized email
 * @throws Error if email is invalid
 */
export function validateEmail(email: string | null | undefined): string | null {
  return normalizeEmail(email, { throwOnError: true });
}

/**
 * Validate phone number.
 * Convenience wrapper that throws on invalid input.
 *
 * @param phone - Phone to validate
 * @returns Normalized phone in E.164 format
 * @throws Error if phone is invalid
 */
export function validatePhone(phone: string | null | undefined): string | null {
  return normalizePhone(phone, { throwOnError: true });
}

/**
 * Check if a string is a valid email format.
 *
 * @param email - Email to check
 * @returns True if valid email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) !== null;
}

/**
 * Check if a string is a valid phone format.
 *
 * @param phone - Phone to check
 * @returns True if valid E.164 phone format
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  return normalizePhone(phone) !== null;
}
