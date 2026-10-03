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

// ============================================================================
// Internal / test account detection
//
// Company reads must only exclude confirmed internal or test identities.
// Known internal/QA domains, reserved test domains and explicit historical
// test tags are shared by JS and SQL. External mailbox names are ambiguous.
// ============================================================================

/**
 * Domains whose accounts are always internal, never customers. The admin
 * email domain mirrors NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN (same default as
 * `constants/domains.ts`); it is read from env directly so this module stays
 * dependency-free for test mocks.
 */
const INTERNAL_ACCOUNT_EMAIL_DOMAINS = [
  'jov.ie',
  (process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN || 'jov.ie').trim().toLowerCase(),
] as const;

/**
 * Dogfood/QA mailbox domains (JOV-7362). Accounts on these domains are created
 * exclusively for internal dogfooding and QA (e.g. `*@test.jovie.com` E2E and
 * auth-surface QA accounts) and must never count as customers in cohort,
 * revenue, or growth metrics.
 */
const DOGFOOD_ACCOUNT_EMAIL_DOMAINS = ['test.jovie.com'] as const;

/** Clerk test-address tag, e.g. browse+clerk_test@jov.ie */
const CLERK_TEST_TAG_PATTERN = /\+clerk_test(\+|$)/;

/**
 * POSIX ERE equivalent of `isInternalOrTestAccountEmail` for use in Postgres
 * `~*` filters. `users.email` is compared lowercased + case-insensitively.
 */
export const INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN = [
  // Internal team domains (jov.ie + configured admin domain), incl. subdomains
  `@(.*\\.)?(${INTERNAL_ACCOUNT_EMAIL_DOMAINS.map(domain =>
    domain.replaceAll('.', '\\.')
  ).join('|')})$`,
  // Dogfood/QA mailbox domains (test.jovie.com), incl. subdomains
  `@(.*\\.)?(${DOGFOOD_ACCOUNT_EMAIL_DOMAINS.map(domain =>
    domain.replaceAll('.', '\\.')
  ).join('|')})$`,
  // Reserved/test-only domains (+ subdomains)
  '@(.*\\.)?(example\\.(com|net|org)|invalid|localhost|test)$',
  // Clerk test-address tag anywhere in the local part
  `^[^@]*\\+clerk_test(\\+[^@]*)?@`,
].join('|');

/** Confirmed internal/test domain or explicit historical test-address tag.
 * Null, unknown and name-only hints remain customer eligible.
 */
export function isInternalOrTestAccountEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) return false;

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  if (
    [...INTERNAL_ACCOUNT_EMAIL_DOMAINS, ...DOGFOOD_ACCOUNT_EMAIL_DOMAINS].some(
      internalDomain =>
        domain === internalDomain || domain.endsWith(`.${internalDomain}`)
    )
  ) {
    return true;
  }

  if (isReservedTestEmailDomain(domain)) return true;

  // A suggestive name (qa, demo, dogfood, *-public, etc.) is not evidence
  // that an external customer is a fixture. Preserve ambiguous accounts.
  return CLERK_TEST_TAG_PATTERN.test(localPart);
}
