/**
 * Email utility functions for consistent email handling across the application.
 *
 * This module consolidates email normalization logic that was previously
 * duplicated across multiple files (waitlist route, auth gate, etc.).
 */

/**
 * Normalize email addresses for consistent storage and comparison.
 *
 * Normalization rules:
 * - Trim leading/trailing whitespace
 * - Convert to lowercase
 *
 * This ensures case-insensitive email matching and prevents duplicate
 * entries with different casing (e.g., "Test@Example.com" vs "test@example.com").
 *
 * @param email - Raw email address from user input
 * @returns Normalized email address
 *
 * @example
 * normalizeEmail('  TEST@EXAMPLE.COM  ') // returns 'test@example.com'
 * normalizeEmail('user@Domain.COM') // returns 'user@domain.com'
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const RESERVED_TEST_EMAIL_DOMAINS = [
  'example.com',
  'example.net',
  'example.org',
  'invalid',
  'localhost',
  'test',
] as const;

export function getEmailDomain(email: string): string | null {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.lastIndexOf('@');

  if (atIndex === -1 || atIndex === normalizedEmail.length - 1) {
    return null;
  }

  return normalizedEmail.slice(atIndex + 1);
}

export function isReservedTestEmailDomain(domain: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase();

  return RESERVED_TEST_EMAIL_DOMAINS.some(
    reservedDomain =>
      normalizedDomain === reservedDomain ||
      normalizedDomain.endsWith(`.${reservedDomain}`)
  );
}

export function getEmailSendBlockReason(email: string): string | null {
  const domain = getEmailDomain(email);

  if (!domain) {
    return null;
  }

  if (isReservedTestEmailDomain(domain)) {
    return `Recipient domain ${domain} is reserved for testing`;
  }

  return null;
}
