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
// Company reads (e.g. Summer revenue + cohorts, JOV-6673) must only count real
// external customers. Team inboxes live on jov.ie (and any configured admin
// domain); seeded QA/E2E/demo accounts use recognizable local parts. Keep the
// JS classifier and INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN in sync — the SQL copy
// is a POSIX ERE used by Postgres `~*` queries where per-row JS filtering
// would break aggregate counts.
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

/**
 * Local-part prefixes used by seeded QA/E2E accounts. Written as a POSIX-safe
 * alternation so the same source can drive both the JS RegExp below and the
 * SQL pattern (`auth[-_]?qa` covers both `auth-qa` and `auth_qa`).
 */
const TEST_ACCOUNT_LOCAL_PART_PREFIXES =
  '(e2e|browse|auth[-_]?qa|qa|smoke|staging|test|demo|dogfood|seed|fixture|autotest)';

const TEST_ACCOUNT_LOCAL_PART_PATTERN = new RegExp(
  `^${TEST_ACCOUNT_LOCAL_PART_PREFIXES}([-_.+]|$)`
);

/** Clerk test-address tag, e.g. browse+clerk_test@jov.ie */
const CLERK_TEST_TAG_PATTERN = /\+clerk_test(\+|$)/;

/**
 * Synthetic dogfood principal tag (JOV-7697), e.g.
 * canary+synthetic-grokbot-run42@mail.example. The canonical roster lives in
 * `lib/synthetic/principals.ts`; any address carrying the tag is quarantined
 * from customer metrics even after its roster entry is revoked. The production
 * waitlist canary's reserved `+jovie-prod-waitlist-canary` identity is the
 * roster's `canary` actor and is quarantined the same way.
 */
export const SYNTHETIC_PRINCIPAL_EMAIL_TAG = '+synthetic-' as const;
export const PRODUCTION_CANARY_EMAIL_TAG =
  '+jovie-prod-waitlist-canary' as const;
const SYNTHETIC_PRINCIPAL_TAG_PATTERN =
  /\+synthetic-(?:[a-z0-9])|\+jovie-prod-waitlist-canary$/;

/** Seeded demo personas, e.g. dualipa-public@jov.ie */
const DEMO_PLACEHOLDER_LOCAL_PART_PATTERN = /-public$/;

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
  // Synthetic dogfood principal tag anywhere in the local part (JOV-7697)
  '^[^@]*\\+synthetic-([a-z0-9])[^@]*@',
  '^[^@]*\\+jovie-prod-waitlist-canary@',
  // Demo placeholder personas: *-public@…
  '^[^@]+-public@',
  // Known test/QA local-part prefixes on any domain (separator or bare local)
  `^${TEST_ACCOUNT_LOCAL_PART_PREFIXES}([-_.+][^@]*)?@`,
].join('|');

/**
 * True when the email belongs to an internal or test/demo account rather than
 * a real external customer: team domains (jov.ie, admin domain), dogfood/QA
 * mailbox domains (test.jovie.com), reserved test domains, Clerk `+clerk_test`
 * tags, synthetic principal `+synthetic-` tags, `*-public` demo placeholders,
 * and seeded QA local-part prefixes (e2e, browse, qa, auth-qa, smoke, staging,
 * test, demo, dogfood, seed, fixture, autotest).
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

  return (
    TEST_ACCOUNT_LOCAL_PART_PATTERN.test(localPart) ||
    CLERK_TEST_TAG_PATTERN.test(localPart) ||
    SYNTHETIC_PRINCIPAL_TAG_PATTERN.test(localPart) ||
    DEMO_PLACEHOLDER_LOCAL_PART_PATTERN.test(localPart)
  );
}
