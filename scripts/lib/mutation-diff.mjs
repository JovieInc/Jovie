// Diff-scoped mutation testing for high-risk apps/web source.
//
// Stryker's vitest runner (10.0.0) loses results for tests nested in
// `describe` blocks under vitest 5, so every killed mutant there scores as
// Survived. This lane uses Stryker's command runner instead: each mutant runs
// a plain `vitest run` over the tests that import the mutated file.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

export const WEB_ROOT = 'apps/web';

/** apps/web-relative prefixes where a weak test costs money, access, or trust. */
export const HIGH_RISK_PREFIXES = Object.freeze([
  'app/api/billing/',
  'app/api/stripe/',
  'app/api/webhooks/',
  'lib/auth/',
  'lib/billing/',
  'lib/claim/',
  'lib/cron/auth.ts',
  'lib/entitlements/',
  'lib/idempotency.ts',
  'lib/stripe/',
  'proxy.ts',
]);

const SOURCE_EXTENSION = /\.(?:ts|tsx)$/u;
const NON_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.d\.ts$|\/__tests__\/|\/__mocks__\/)/u;
const TEST_FILE = /\.test\.(?:ts|tsx)$/u;
const SKIPPED_TEST_DIRS = new Set([
  '.next',
  '.stryker-tmp',
  'node_modules',
  'coverage',
  'reports',
]);
// Mirrors the slow suites vitest.config.fast.mts excludes.
const SKIPPED_TEST_PATHS =
  /^tests\/(?:e2e|eval|audit|performance|integration|docs-guides|product-screenshots|visual-qa)\//u;
const SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\bvi\.importActual\s*(?:<[^>]*>)?\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
const ALIASES = Object.freeze([
  ['@/app/(shell)/', 'app/app/(shell)/'],
  ['@/features/', 'components/features/'],
  ['@/', ''],
]);

/**
 * Pick the changed files this lane mutates.
 * @param {string[]} changedPaths repo-relative paths
 * @returns {string[]} apps/web-relative source paths
 */
export function selectHighRiskSources(changedPaths) {
  const selected = new Set();
  for (const path of changedPaths) {
    if (!path.startsWith(`${WEB_ROOT}/`)) continue;
    const webPath = path.slice(WEB_ROOT.length + 1);
    if (!SOURCE_EXTENSION.test(webPath) || NON_SOURCE.test(webPath)) continue;
    if (HIGH_RISK_PREFIXES.some(prefix => webPath.startsWith(prefix))) {
      selected.add(webPath);
    }
  }
  return [...selected].sort();
}

/**
 * Resolve an import specifier from a test file to an extensionless
 * apps/web-relative module path, or null when it leaves the app.
 * @param {string} specifier
 * @param {string} testPath apps/web-relative
 */
export function resolveSpecifier(specifier, testPath) {
  for (const [alias, target] of ALIASES) {
    if (specifier.startsWith(alias)) {
      return stripModuleSuffix(target + specifier.slice(alias.length));
    }
  }
  if (!specifier.startsWith('.')) return null;
  const resolved = posix.normalize(
    posix.join(posix.dirname(testPath), specifier)
  );
  return resolved.startsWith('..') ? null : stripModuleSuffix(resolved);
}

/** @param {string} path */
function stripModuleSuffix(path) {
  return path.replace(SOURCE_EXTENSION, '').replace(/\.js$/u, '');
}

/**
 * Tests that import the source directly, statically or dynamically.
 * `vi.mock` targets are ignored: a mocked module cannot kill its mutants.
 * @param {string} sourcePath apps/web-relative
 * @param {Map<string, string>} testSources apps/web-relative path -> contents
 */
export function findRelatedTests(sourcePath, testSources) {
  const target = stripModuleSuffix(sourcePath);
  const indexTarget = target.endsWith('/index')
    ? target.slice(0, -'/index'.length)
    : null;
  const related = [];
  for (const [testPath, contents] of testSources) {
    for (const match of contents.matchAll(SPECIFIER)) {
      const resolved = resolveSpecifier(match[1], testPath);
      if (resolved === target || (indexTarget && resolved === indexTarget)) {
        related.push(testPath);
        break;
      }
    }
  }
  return related.sort();
}

/**
 * @param {string} webRoot absolute path to apps/web
 * @returns {Map<string, string>}
 */
export function readTestSources(webRoot) {
  /** @type {Map<string, string>} */
  const tests = new Map();
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED_TEST_DIRS.has(entry.name)) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const webPath = relative(webRoot, absolute).split('\\').join('/');
      if (!TEST_FILE.test(webPath) || SKIPPED_TEST_PATHS.test(webPath)) {
        continue;
      }
      if (webPath.includes('.nightly.test.')) continue;
      tests.set(webPath, readFileSync(absolute, 'utf8'));
    }
  };
  walk(webRoot);
  return tests;
}

/**
 * @typedef {{ status: string, mutatorName: string, replacement?: string,
 *   location: { start: { line: number } } }} Mutant
 * @typedef {{ file: string, tests: string[], mutants: Mutant[] }} FileResult
 */

/** @param {Mutant[]} mutants */
export function scoreMutants(mutants) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const mutant of mutants) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
  }
  const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0);
  const undetected = (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
  const valid = detected + undetected;
  return {
    detected,
    undetected,
    valid,
    score: valid === 0 ? null : Math.round((detected / valid) * 1000) / 10,
  };
}

/**
 * Markdown summary: one row per file, then the first survivors per file.
 * @param {{ results: FileResult[], untested: string[], skipped: string[],
 *   lowScore: number, survivorsPerFile?: number }} input
 */
export function renderSummary({
  results,
  untested,
  skipped,
  lowScore,
  survivorsPerFile = 10,
}) {
  const lines = ['## Mutation diff (advisory)', ''];
  if (results.length === 0 && untested.length === 0) {
    lines.push('No changed high-risk source files.');
    return `${lines.join('\n')}\n`;
  }
  if (results.length > 0) {
    lines.push('| File | Score | Detected | Survived | Tests |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const result of results) {
      const { detected, undetected, score } = scoreMutants(result.mutants);
      const flag = score !== null && score < lowScore ? ' (low)' : '';
      const shown = score === null ? 'n/a' : `${score}%${flag}`;
      lines.push(
        `| \`${result.file}\` | ${shown} | ${detected} | ${undetected} | ${result.tests.length} |`
      );
    }
  }
  for (const result of results) {
    const survivors = result.mutants.filter(
      mutant => mutant.status === 'Survived' || mutant.status === 'NoCoverage'
    );
    if (survivors.length === 0) continue;
    lines.push('', `### Survivors in \`${result.file}\``, '');
    for (const mutant of survivors.slice(0, survivorsPerFile)) {
      const replacement = (mutant.replacement ?? '')
        .replace(/\s+/gu, ' ')
        .slice(0, 80);
      lines.push(
        `- L${mutant.location.start.line} ${mutant.mutatorName} → \`${replacement}\``
      );
    }
    if (survivors.length > survivorsPerFile) {
      lines.push(`- …and ${survivors.length - survivorsPerFile} more`);
    }
  }
  if (untested.length > 0) {
    lines.push('', '### No test imports these files', '');
    for (const file of untested) lines.push(`- \`${file}\``);
  }
  if (skipped.length > 0) {
    lines.push('', '### Skipped (file cap)', '');
    for (const file of skipped) lines.push(`- \`${file}\``);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} reportPath
 * @param {string} sourcePath apps/web-relative
 */
export function readReportMutants(reportPath, sourcePath) {
  if (!existsSync(reportPath)) return null;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const entry = report.files?.[sourcePath];
  return entry ? /** @type {Mutant[]} */ (entry.mutants) : null;
}
