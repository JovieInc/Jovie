/**
 * Changelog auto-filter rules for the public web app.
 *
 * This file intentionally lives under apps/web so the Next.js build never
 * reaches outside the app root when parsing the public changelog.
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
  /\[\s*internal\s*\]/i,

  // Staging/infra URLs
  /staging\.jov\.ie/,
  /clerk\.jov\.ie/,
  /__clerk/,

  // Dev tooling
  /\bDevToolbar\b/i,
  /\bdev toolbar\b/i,
  /\bdev overlay/i,

  // CI/CD
  /\bCI[\s/]/,
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

  // Technical internals
  /\bClerk SDK\b/i,
  /\bVercel SDK\b/i,
  /\bSentry SDK\b/i,
  /\bAI SDK\b/i,
  /\bmiddleware\b/i,
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
  /\badmin\b/i,
  /\/app\/admin(?:\/|$)/i,
  /\/api\/admin(?:\/|$)/i,
  /\/api\/cron(?:\/|$)/i,
  /\/api\/changelog(?:\/|$)/i,
  /\/api\/hud(?:\/|$)/i,

  // Business-sensitive
  /\binvestor portal\b/i,
  /\binvestor memo\b/i,
  /\bYC demo\b/i,
  /\bconversion funnel\b/i,
  /\bcheckout intercept\b/i,
  /\boutreach email\b/i,
  /\blead pipeline\b/i,

  // Operational and security implementation details
  /\bbearer verification\b/i,
  /\btiming-safe\b/i,
  /\btrusted-origin\b/i,
  /\bdurable coordination\b/i,
  /\bfail closed\b/i,
  /\bredis-backed\b/i,
  /\brate[- ]limiters?\b/i,
  /\bidempotency\b/i,
  /\bdedupe\b/i,
  /\bwebhook dispatch\b/i,
  /\bwebhook dedupe\b/i,
  /\bcron control\b/i,
  /\bdeploy promotion\b/i,
  /\bserverfetch\(\)\b/i,
  /\btoken\b/i,
  /\bverification token\b/i,
  /\btrusted origin\b/i,

  // Dollar amounts in internal cost/budget contexts
  /\bbudget\b.*\$\d+/i,
  /\$\d+.*\b(budget|cost)\b/i,

  // Dependency version bumps
  /\d+\.\d+\.\d+\s*→\s*\d+\.\d+\.\d+/,
];

export function isInternalEntry(entry: string): boolean {
  for (const pattern of VENDOR_PATTERNS) {
    if (pattern.test(entry)) return true;
  }

  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(entry)) return true;
  }

  return false;
}
