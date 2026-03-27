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

const VENDOR_TOKENS = new Set(VENDOR_NAMES.map(name => name.toLowerCase()));

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
  /\b(?:bearer|verification|access|refresh)\s+token\b/i,
  /\bverification token\b/i,
  /\btrusted origin\b/i,
];

const DOLLAR_AMOUNT_RE = /\$\d+/;
const SEMVER_TOKEN_RE = /^\d+\.\d+\.\d+$/;

function hasBudgetOrCostLeak(entry: string): boolean {
  if (!DOLLAR_AMOUNT_RE.test(entry)) return false;
  const lower = entry.toLowerCase();
  return lower.includes('budget') || lower.includes('cost');
}

function hasDependencyVersionBump(entry: string): boolean {
  const tokens = entry.replaceAll('→', ' → ').split(/\s+/).filter(Boolean);

  for (let index = 1; index < tokens.length - 1; index += 1) {
    if (tokens[index] !== '→') continue;
    if (
      SEMVER_TOKEN_RE.test(tokens[index - 1]) &&
      SEMVER_TOKEN_RE.test(tokens[index + 1])
    ) {
      return true;
    }
  }

  return false;
}

export function isInternalEntry(entry: string): boolean {
  const normalizedTokens = entry
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  for (const token of normalizedTokens) {
    if (VENDOR_TOKENS.has(token)) return true;
  }

  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(entry)) return true;
  }

  if (hasBudgetOrCostLeak(entry)) return true;
  if (hasDependencyVersionBump(entry)) return true;

  return false;
}
