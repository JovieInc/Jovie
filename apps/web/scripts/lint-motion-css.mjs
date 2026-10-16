#!/usr/bin/env node
/**
 * Deterministic motion lint for plain stylesheet files (.css/.scss).
 *
 * The `@jovie/no-raw-motion-values` ESLint rule only sees TSX/TS source, so
 * `transition: all`, `will-change: all`, and raw ms/s durations in component
 * stylesheets escaped enforcement. This script closes that gap with the same
 * DS motion-token guidance (.claude/rules/motion.md → DESIGN.md Motion):
 *
 *   transition: <prop> var(--duration-subtle) var(--ease-subtle)
 *
 * instead of `transition: all 300ms ease-in`.
 *
 * Checks:
 *   - `transition` / `transition-property` declarations containing `all`
 *   - `will-change: all`
 *   - raw ms/s durations inside `transition*`, `animation*` duration
 *     declarations and the `transition`/`animation` shorthands
 *
 * Raw-duration hits are ratcheted through GRANDFATHERED_PATH_FRAGMENTS —
 * remove entries as files migrate to tokens, NEVER add new ones. The
 * `transition: all` / `will-change: all` checks apply everywhere.
 *
 * Usage:
 *   node scripts/lint-motion-css.mjs            # scan repo stylesheets
 *   node scripts/lint-motion-css.mjs --files a.css b.css
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved lazily in main(): under the Vitest transform import.meta.url is not
// a file:// URL, so module-level fileURLToPath throws before tests can import
// the pure functions.
function repoRoot() {
  return resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    '..',
    '..'
  );
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cache',
  'storybook-static',
]);

// Mirror of ALLOWED_PATH_FRAGMENTS in eslint-rules/no-raw-motion-values.js:
// token definition files, experiments, tests, and stories are exempt.
const ALLOWED_PATH_FRAGMENTS = [
  '/apps/web/styles/',
  '/apps/web/eslint-rules/',
  '/app/exp/',
  '.stories.',
  '.test.',
  '.spec.',
  '/tailwind.config.',
  '/.storybook/',
];

// Pre-existing raw-duration violations. Decrementing ratchet: remove entries
// as files migrate to tokens — NEVER add new entries. Applies ONLY to the
// rawDuration check; transition:all / will-change:all still run everywhere.
const GRANDFATHERED_PATH_FRAGMENTS = [
  '/app/(home)/home.css',
  '/app/globals.css',
  '/components/marketing/ProductScreenshotFrame.css',
  '/components/marketing/artist-profile/ArtistProfileLandingPage.css',
  '/components/marketing/artist-profile/captureShared.css',
  '/components/marketing/homepage-v2/HomepageV2Route.css',
];

const RAW_MS_DURATION_REGEX = /\b\d+ms\b/;
// Same shape as the ESLint rule: `150ms` does not match — the char before the
// final `s` must be a digit or dot.
const RAW_SECONDS_DURATION_REGEX = /(?<![\w.-])(\d*\.?\d+)s\b/;
const ALL_VALUE_REGEX = /(?:^|[\s,!])all(?:[\s,!]|$)/;
// prop: value declarations. `!important` lands inside the value capture.
// Up to two leading hyphens so custom properties (--foo) parse whole.
const DECLARATION_REGEX = /(-{0,2}[a-zA-Z][-a-zA-Z]*)\s*:\s*([^;{}]+)/g;
// -webkit-transition etc. check the same as their unprefixed property.
const VENDOR_PREFIX_REGEX = /^-[a-z]+-/;

const TRANSITION_ALL_PROPERTIES = new Set([
  'transition',
  'transition-property',
]);
const WILL_CHANGE_PROPERTIES = new Set(['will-change']);
const RAW_DURATION_PROPERTIES = new Set([
  'transition',
  'transition-duration',
  'animation',
  'animation-duration',
]);

const MESSAGES = {
  transitionAll:
    'Avoid `transition: all` in stylesheets — it animates every property (including layout) and ignores motion tokens. List the specific properties and pair with `var(--duration-subtle)`/`var(--ease-subtle)` from DS_FOUNDATION_V1 (see @jovie/no-raw-motion-values / .claude/rules/motion.md).',
  willChangeAll:
    'Avoid `will-change: all` — it promotes every property and wastes compositor memory. Name the properties that actually animate (e.g. `will-change: transform, opacity`).',
  rawDuration:
    'Raw `{{value}}` duration in stylesheet bypasses the DS motion tokens (and UI motion should complete within 300ms). Use `var(--ds-motion-subtle-duration)`/`var(--duration-subtle)` or `var(--ds-motion-cinematic-duration)`/`var(--duration-cinematic)`.',
};

function normalizePath(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function isAllowedFile(filename) {
  const normalized = normalizePath(filename);
  return ALLOWED_PATH_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

function isGrandfatheredFile(filename) {
  const normalized = normalizePath(filename);
  return GRANDFATHERED_PATH_FRAGMENTS.some(fragment =>
    normalized.includes(fragment)
  );
}

// Replace /* */ comments with spaces so declaration scanning never sees
// comment text, while preserving line numbers for reporting.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, match =>
    match.replace(/[^\n]/g, ' ')
  );
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

export function lintCssSource(source, filename, options = {}) {
  const grandfathered = options.grandfathered ?? isGrandfatheredFile(filename);
  const stripped = stripComments(String(source));
  const violations = [];

  for (const match of stripped.matchAll(DECLARATION_REGEX)) {
    const rawProperty = match[1].toLowerCase();
    if (rawProperty.startsWith('--')) continue;
    const property = rawProperty.replace(VENDOR_PREFIX_REGEX, '');
    const value = match[2];
    const index = match.index ?? 0;
    const report = (messageId, data = {}) => {
      violations.push({
        line: lineNumberAt(stripped, index),
        property,
        messageId,
        message: Object.entries(data).reduce(
          (text, [key, val]) => text.replaceAll(`{{${key}}}`, val),
          MESSAGES[messageId]
        ),
      });
    };

    if (
      TRANSITION_ALL_PROPERTIES.has(property) &&
      ALL_VALUE_REGEX.test(value)
    ) {
      report('transitionAll');
    }
    if (
      WILL_CHANGE_PROPERTIES.has(property) &&
      /(?:^|[\s,])all(?:[\s,]|$)/.test(value.trim())
    ) {
      report('willChangeAll');
    }
    if (!grandfathered && RAW_DURATION_PROPERTIES.has(property)) {
      const ms = value.match(RAW_MS_DURATION_REGEX)?.[0];
      if (ms) {
        report('rawDuration', { value: ms });
      } else {
        const seconds = value.match(RAW_SECONDS_DURATION_REGEX)?.[0];
        if (seconds) report('rawDuration', { value: seconds });
      }
    }
  }

  return violations;
}

export function shouldScanFile(filename) {
  if (!/\.(css|scss)$/.test(filename)) return false;
  return !isAllowedFile(filename);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && /\.(css|scss)$/.test(entry.name)) {
      yield full;
    }
  }
}

async function main() {
  const REPO_ROOT = repoRoot();
  const SCAN_ROOTS = [
    resolve(REPO_ROOT, 'apps/web'),
    resolve(REPO_ROOT, 'packages'),
  ];
  const args = process.argv.slice(2);
  const filesIndex = args.indexOf('--files');
  let files;
  if (filesIndex !== -1) {
    files = args.slice(filesIndex + 1).map(f => resolve(REPO_ROOT, f));
  } else {
    files = [];
    for (const root of SCAN_ROOTS) {
      for await (const file of walk(root)) {
        files.push(file);
      }
    }
    if (files.length === 0) {
      console.error(
        `lint-motion-css: no stylesheets found under ${SCAN_ROOTS.join(', ')} — scan-root misconfiguration, refusing to pass silently.`
      );
      process.exit(1);
    }
  }

  let violationCount = 0;
  for (const file of files.sort()) {
    if (!shouldScanFile(file)) continue;
    const source = await readFile(file, 'utf8');
    const rel = relative(REPO_ROOT, file);
    for (const violation of lintCssSource(source, rel)) {
      violationCount++;
      console.error(
        `${rel}:${violation.line}  ${violation.messageId}  ${violation.message}`
      );
    }
  }

  if (violationCount > 0) {
    console.error(
      `\nlint-motion-css: ${violationCount} violation(s). Use DS motion tokens (var(--duration-subtle) / var(--ease-subtle)) — see .claude/rules/motion.md.`
    );
    process.exit(1);
  }
  console.log('lint-motion-css: no motion violations in stylesheets');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
