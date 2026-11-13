/**
 * Changelog Auto-Filter Rules
 *
 * Safety net that catches internal entries even when developers forget
 * to add the [internal] prefix. Mirror of the TypeScript copy at
 * apps/web/lib/changelog-filter-rules.ts — the two copies must stay
 * rule-for-rule identical; the parity test in
 * apps/web/lib/__tests__/changelog-parser.test.ts compares both rule lists
 * and their classification behavior.
 */

/**
 * Vendor names that should never appear in public changelog entries.
 * Exported for the cross-language parity test.
 */
export const VENDOR_NAMES = [
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

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VENDOR_PATTERNS = VENDOR_NAMES.map(
  name => new RegExp(`\\b${escapeRegex(name)}\\b`)
);

/**
 * Infrastructure, dev tooling, admin, and business-sensitive patterns.
 * Exported for the cross-language parity test.
 */
export const INTERNAL_PATTERNS = [
  // Local development and operator implementation are not product updates.
  /\b(?:localhost|127\.0\.0\.1|loopback|Chromium|SwiftUI|invalidAuthURL)\b/i,
  /\bhot[- ]reload\b/i,
  /\b(?:merge[- ]queue|worktrees?|kiosk token|TV HUD)\b/i,
  /\/(?:hud(?:-tv)?|app\/ov)(?:[/?\s`.]|$)/i,
  /\b(?:lib|scripts|packages)\/[\w/-]+/,
  /\b(?:context_facts|suggested_actions|external_objects|context_fact_kind)\b/,
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  /\b(?:wire tokens|Summer classifies|founder walks)\b/i,
  /\b(?:System B|infra train|train integration)\b|^VERSION:/i,
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

  // Technical internals (SDK only when paired with vendor context)
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

function hasBudgetOrCostLeak(entry) {
  if (!DOLLAR_AMOUNT_RE.test(entry)) return false;
  const lower = entry.toLowerCase();
  return lower.includes('budget') || lower.includes('cost');
}

function hasDependencyVersionBump(entry) {
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

function hasVendorLeak(entry) {
  return VENDOR_PATTERNS.some(pattern => pattern.test(entry));
}

/**
 * Check whether a changelog entry should be auto-filtered from public output.
 *
 * @param {string} entry - The entry text (without the leading "- ")
 * @returns {boolean} true if the entry should be hidden from public changelog
 */
export function isInternalEntry(entry) {
  if (hasVendorLeak(entry)) return true;
  for (const pattern of INTERNAL_PATTERNS) {
    if (pattern.test(entry)) return true;
  }
  if (hasBudgetOrCostLeak(entry)) return true;
  if (hasDependencyVersionBump(entry)) return true;
  return false;
}

/** A customer outcome must not publish test, agent, or source-maintenance copy. */
export function isCustomerCopy(entry) {
  return (
    !isInternalEntry(entry) &&
    !/\b(?:Codex|GBrain|PersistentAudioBar|test-only|unit tests?|runner|worktree|refactor|source guard|migration journal|JOV-\d+)\b|\bP[0-3]\b|\b(?:apps|tests|scripts|packages)\/[\w/-]+/i.test(
      entry
    )
  );
}

// ---------------------------------------------------------------------------
// Customer changelog copy rules (deterministic; no model, no network).
//
// One headline rule for two owners: the `customer-changelog/v1` marker in a
// source PR body (Source Validation) and the editorial overlay in
// apps/web/data/customer-changelog-editorial.json. The web projection applies
// the same rule in apps/web/lib/customer-changelog-editorial.ts; the parity
// test in __tests__/changelog-source-guard.test.mjs keeps the two in step.
// ---------------------------------------------------------------------------

export const HEADLINE_MAX = 60;
/** Markers in PRs created from this instant must pass the copy lint. */
export const COPY_LINT_FROM = '2026-11-14T00:00:00Z';

const TITLE_CASE_MIN_WORDS = 4;

/** Sentence case: a capital or digit first, and the rest not Title Case. */
export function isSentenceCaseHeadline(headline) {
  if (!/^[\p{Lu}\p{N}]/u.test(headline)) return false;
  const rest = headline
    .split(/\s+/)
    .slice(1)
    .filter(word => /^\p{L}/u.test(word) && !/^\p{Lu}+$/u.test(word));
  if (rest.length + 1 < TITLE_CASE_MIN_WORDS) return true;
  const capitalised = rest.filter(word => /^\p{Lu}/u.test(word)).length;
  return capitalised * 2 <= rest.length;
}

/** Every reason a headline breaks the rule; empty when it is compliant. */
export function headlineProblems(headline) {
  const value = String(headline ?? '');
  if (!value.trim()) return ['is empty'];
  const problems = [];
  if (value !== value.trim()) problems.push('has surrounding whitespace');
  if (value.length > HEADLINE_MAX)
    problems.push(`is ${value.length} characters (max ${HEADLINE_MAX})`);
  if (/[.!:;,]$/.test(value.trim())) problems.push('ends with punctuation');
  if (/[\r\n<>]/.test(value)) problems.push('contains markup or a newline');
  if (!isSentenceCaseHeadline(value.trim()))
    problems.push('is not sentence case');
  return problems;
}

/** "Headline: explanation" (or an em/en dash), as the web projection splits it. */
export function splitHeadline(text) {
  const value = String(text ?? '').trim();
  const match =
    /^(.+?):\s+(.+)$/s.exec(value) ?? /^(.+?)\s+[—–]\s+(.+)$/s.exec(value);
  return match
    ? { headline: match[1].trim(), explanation: match[2].trim() }
    : null;
}

/**
 * Words that describe how we build, not what a customer gets. Each entry is
 * [pattern, what to write instead].
 * @type {[RegExp, string][]}
 */
const INTERNAL_WORDS = [
  [/\bPRs?\b/, 'drop the pull request; say what changed for the customer'],
  [/\bdeploy(?:s|ed|ment|ments|ing)?\b/i, 'say "now" or "today", not a deploy'],
  [/\bCI\b/, 'leave the build pipeline out'],
  [/\b(?:feature )?flags?\b/i, 'say who has it: availability carries rollout'],
  [/\bAPIs?\b/, 'name what the customer or their tools can do'],
  [/\bendpoints?\b/i, 'name what the customer or their tools can do'],
  [/\bregress(?:ion|ions|ed)\b/i, 'describe how it works now'],
  [/\bstaging\b/i, 'leave environments out'],
  [/\bJOV-\d+\b/, 'leave issue ids out'],
  [
    /\b(?:refactor(?:ed|ing)?|cron|webhooks?|backend|frontend|middleware)\b/i,
    'describe the outcome, not the implementation',
  ],
  [
    /\b(?:Redis|Sentry|Vercel|Neon|Postgres|Cloudflare|Turnstile|Doppler|Statsig|Upstash|Inngest|Supabase|PostHog|Clerk|Datadog)\b/,
    'leave the vendor out; it is an implementation detail',
  ],
];

/**
 * Phrases that read as an apology. Each entry is [pattern, the fix].
 * @type {[RegExp, string][]}
 */
const UNFLATTERING_PHRASES = [
  [/\bagain\b/i, 'say what works now; "again" says it was broken'],
  [/\bfinally\b/i, 'drop "finally"'],
  [/\b(?:was|were) broken\b/i, 'describe how it works now'],
  [
    /\bno longer (?:crash|crashes|crashing|fails?|breaks?|errors?)\b/i,
    'describe how it works now',
  ],
  [/\b(?:bug|bugs|bugfix|buggy)\b/i, 'describe what works now, not the bug'],
  [/\b(?:crash|crashes|crashed|crashing)\b/i, 'describe what works now'],
  [/\boops\b|\bsorry\b|\bembarrass/i, 'state the outcome plainly'],
  [/\binstead of an error\b/i, 'describe what the customer sees now'],
];

/**
 * Lint the `text` of a release-worthy marker. Returns fix-it lines; empty
 * when the copy is publishable.
 */
export function lintCustomerNoteCopy(text) {
  const value = String(text ?? '');
  const problems = [];
  const split = splitHeadline(value);
  if (!split) {
    problems.push(
      `text must read "Headline: explanation" (a short outcome headline, a colon, then one or two full sentences).`
    );
  } else {
    for (const problem of headlineProblems(split.headline))
      problems.push(
        `headline "${split.headline}" ${problem}. Write a sentence-case outcome of at most ${HEADLINE_MAX} characters with no trailing punctuation.`
      );
    if (!/^[\p{Lu}\p{N}"“]/u.test(split.explanation))
      problems.push(
        'explanation must start with a capital letter: it is its own sentence, not the tail of the headline.'
      );
  }
  for (const [pattern, fix] of INTERNAL_WORDS) {
    const match = pattern.exec(value);
    if (match) problems.push(`internal word "${match[0]}": ${fix}.`);
  }
  for (const [pattern, fix] of UNFLATTERING_PHRASES) {
    const match = pattern.exec(value);
    if (match) problems.push(`unflattering phrasing "${match[0]}": ${fix}.`);
  }
  return problems;
}

/** True when a PR created at `createdAt` is held to the copy lint. */
export function isCopyLintApplicable(createdAt) {
  return Date.parse(createdAt) >= Date.parse(COPY_LINT_FROM);
}

/**
 * Fix-it lines for a parsed release-worthy marker, or [] when it passes, is
 * internal, or predates the lint (older PRs keep their admission contract).
 */
export function customerNoteCopyProblems(note, createdAt) {
  return note?.releaseWorthy === true && isCopyLintApplicable(createdAt)
    ? lintCustomerNoteCopy(note.text)
    : [];
}
