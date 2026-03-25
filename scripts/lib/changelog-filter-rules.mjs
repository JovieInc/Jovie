/**
 * Changelog Auto-Filter Rules
 *
 * Safety net that catches internal entries even when developers forget
 * to add the [internal] prefix. Used by both the TypeScript parser
 * (apps/web/lib/changelog-parser.ts) and the JS email script parser
 * (scripts/lib/changelog-parser.mjs).
 *
 * Rules derived from: feedback_changelog_rules.md
 */

/** Vendor names that should never appear in public changelog entries. */
const VENDOR_NAMES = [
  'Clerk',
  'Statsig',
  'Sentry',
  'Vercel',
  'Biome',
  'Turbo',
  'Storybook',
  'Doppler',
  'Drizzle',
  'MusicFetch',
  'SonarCloud',
  'TanStack',
  'Playwright',
  'Vitest',
  'Resend',
  'Conductor',
];

/** Word-boundary regex for each vendor name (case-insensitive). */
const VENDOR_PATTERNS = VENDOR_NAMES.map(
  name => new RegExp(`\\b${name}\\b`, 'i')
);

/** Infrastructure, dev tooling, admin, and business-sensitive patterns. */
const INTERNAL_PATTERNS = [
  // Staging/infra URLs
  /staging\.jov\.ie/,
  /clerk\.jov\.ie/,
  /__clerk/,

  // Dev tooling
  /\bDevToolbar\b/i,
  /\bdev toolbar\b/i,
  /\bdev overlay/i,

  // CI/CD
  /\bCI\b/,
  /\bCI guard\b/i,
  /\bCI pipeline\b/i,

  // Database/migrations
  /\bmigration journal\b/i,
  /\bmigration squash\b/i,
  /\bschema verify\b/i,
  /\bconnection pool\b/i,
  /\bmigration script\b/i,

  // Testing internals
  /\bE2E test/i,
  /\bunit test/i,
  /\bsmoke test/i,
  /\btest helper/i,
  /\btest coverage\b/i,
  /\bgolden path\b/i,
  /\bscreenshot spec\b/i,
  /\bscreenshot pipeline\b/i,

  // Technical internals (SDK only when paired with vendor context)
  /\bClerk SDK\b/i,
  /\bVercel SDK\b/i,
  /\bSentry SDK\b/i,
  /\bVercel AI SDK\b/i,
  /\bCSP\b/,
  /\bNODE_ENV\b/,
  /\bNEXT_PUBLIC_/,
  /\benv var\b/i,
  /\bdata-testid\b/,
  /\bcircuit breaker\b/i,
  /\bassertNoDevOverlays\b/,

  // Admin features
  /\badmin board\b/i,
  /\badmin panel\b/i,
  /\badmin table\b/i,
  /\badmin guard\b/i,

  // Business-sensitive
  /\binvestor portal\b/i,
  /\binvestor memo\b/i,
  /\bYC demo\b/i,
  /\bconversion funnel\b/i,
  /\bcheckout intercept\b/i,
  /\boutreach email\b/i,
  /\blead pipeline\b/i,

  // Dollar amounts in internal cost/budget contexts (not user-facing pricing)
  /\bbudget\b.*\$\d+/i,
  /\$\d+.*\b(budget|cost)\b/i,

  // Dependency version bumps (e.g., "10.39.0 → 10.45.0" or "v6.4.1")
  /\d+\.\d+\.\d+\s*→\s*\d+\.\d+\.\d+/,
];

/**
 * Check whether a changelog entry should be auto-filtered from public output.
 *
 * @param {string} entry - The entry text (without the leading "- ")
 * @returns {boolean} true if the entry should be hidden from public changelog
 */
export function isInternalEntry(entry) {
  for (const pattern of VENDOR_PATTERNS) {
    if (pattern.test(entry)) return true;
  }
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(entry)) return true;
  }
  return false;
}
