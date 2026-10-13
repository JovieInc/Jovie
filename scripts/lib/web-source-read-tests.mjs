#!/usr/bin/env node
/**
 * Web unit tests that read their inputs from disk, selected by the paths
 * their source names, so PR CI runs them before the merge queue does.
 *
 * Exact-head Coverage picks web unit tests by import graph (`--changed`).
 * A test that walks `app/app/(shell)` or globs `tests/e2e/storybook-*.spec.ts`
 * imports none of what it reads, so only the merge group's full Unit Tests
 * shards ran it. In the 7 days to 2026-10-12 those source-read guards
 * (shell-nav-coverage, storybook-attachment-names, sentry-ci-reporter,
 * app-screen-registry, table-system-ratchet, ...) ejected about 45 merge
 * groups that PR CI had passed.
 *
 * Selection: every apps/web test file that reads the filesystem, whose path
 * keys match a changed file. Keys are the path-like string literals in the
 * test (`'apps/web/components'`, `'styles/tailwind-foundation.css'`, globs
 * like `'tests/e2e/storybook-*.spec.ts'`) and runs of literal arguments to
 * `join(...)`/`resolve(...)` (`join(ROOT, 'app', 'app', '(shell)')`).
 * Single bare words (`'app'`) are not keys: they would select everything.
 *
 * Usage: node scripts/lib/web-source-read-tests.mjs [--list] [changed paths...]
 * With no paths it reads the PR/merge diff via ci-fast-lanes.mjs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The CLI runs from the checkout root; Source Validation may load this file
// from a trusted base archive elsewhere on disk.
const REPO_ROOT = process.cwd();
const WEB = 'apps/web/';

const FS_READ =
  /\bfrom\s+['"](?:node:)?fs(?:\/promises)?['"]|require\(\s*['"](?:node:)?fs['"]|\breaddirSync\b|\bglobSync\b|fast-glob/u;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/u;
// Tests that launch a browser or the Playwright runner need installed
// browsers, which Source Validation's guard step does not provision; they run
// in the web Unit Tests shards instead. playwright-artifact-secrets reads
// every workflow, so without this any workflow edit failed the guard with
// "Executable doesn't exist ... chrome-headless-shell" (#21546, 10-13).
const LAUNCHES_BROWSER =
  /\b(?:chromium|firefox|webkit)\.launch\(|\blaunchPersistentContext\(|['"]playwright['"]\s*,\s*['"]test['"]/u;
const LITERAL = /(['"`])((?:(?!\1)[^\\\n$])*)\1/gu;
const CALL =
  /\b(?:join|resolve)\(((?:[^()'"`]|'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)*)\)/gu;
const ARG_LITERAL = /^(['"`])([^'"`$]*)\1$/u;
const SEGMENT = /^[\w@.()[\]+*-]+$/u;
const SKIP_DIRS = new Set(['node_modules', '.next', 'coverage']);
const BROAD_KEYS = new Set(['', 'apps', 'apps/web', 'packages', 'scripts']);

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (TEST_FILE.test(entry.name)) out.push(path);
  }
  return out;
}

/** @param {Set<string>} keys @param {string} raw */
function addKey(keys, raw) {
  const unrooted = raw.replace(/^(?:\.{1,2}\/)+/u, '').replace(/\/+$/u, '');
  const webRelative = unrooted
    .replace(/^@\//u, '')
    .replace(/^apps\/web\//u, '');
  for (const literal of new Set([unrooted, webRelative])) {
    if (!literal || /\s/u.test(literal)) continue;
    const parts = literal.split('/');
    if (!parts.every(part => SEGMENT.test(part))) continue;
    // A workspace root or match-all glob names nearly every path; tests that
    // build paths from it also name the subpath they read.
    if (BROAD_KEYS.has(literal.replace(/(?:\/\*\*?)+$/u, ''))) continue;
    if (/^(?:\*\*?\/)*\*$/u.test(literal)) continue;
    if (parts.length > 1) keys.add(literal);
    // A lone segment is a key only when it is a file name or a route group.
    else if (/\.[a-z]{2,5}$/u.test(literal) || /^\(.+\)$/u.test(literal))
      keys.add(literal);
  }
}

/**
 * Path keys a test source names.
 * @param {string} source
 * @returns {Set<string>}
 */
export function pathKeys(source) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const match of source.matchAll(LITERAL)) addKey(keys, match[2]);
  for (const match of source.matchAll(CALL)) {
    /** @type {string[]} */
    const parts = [];
    for (const arg of match[1].split(',').map(part => part.trim())) {
      const literal = ARG_LITERAL.exec(arg);
      if (literal) parts.push(literal[2]);
      else parts.length = 0;
    }
    if (parts.length > 1) addKey(keys, parts.join('/'));
  }
  return keys;
}

/** @param {string} key */
function globPattern(key) {
  const body = key.replace(/[.+()[\]]/gu, '\\$&').replaceAll('*', '[^/]*');
  return new RegExp(`(?:^|/)${body}(?:$|/)`, 'u');
}

/**
 * Whether a changed repo path falls under a key. Keys are matched against the
 * repo path and, for apps/web files, the web-relative path, on whole segments.
 * @param {string} key
 * @param {string} file
 */
export function keyMatches(key, file) {
  const candidates = file.startsWith(WEB)
    ? [file, file.slice(WEB.length)]
    : [file];
  if (key.includes('*')) {
    const pattern = globPattern(key);
    return candidates.some(candidate => pattern.test(candidate));
  }
  return candidates.some(candidate => {
    if (!key.includes('/'))
      return basename(candidate) === key || candidate.split('/').includes(key);
    const padded = `/${candidate}`;
    const at = padded.indexOf(`/${key}`);
    if (at === -1) return false;
    const next = padded[at + key.length + 1];
    // An extensionless key ('lib/foo') also names 'lib/foo.ts'.
    return (
      next === undefined ||
      next === '/' ||
      (next === '.' && !basename(key).includes('.'))
    );
  });
}

/**
 * Repo-relative apps/web test files that read the filesystem and do not
 * launch a browser.
 * @param {string} [root]
 */
export function sourceReadTests(root = REPO_ROOT) {
  if (!existsSync(join(root, WEB))) return [];
  return walk(join(root, WEB), [])
    .map(path =>
      path
        .slice(root.length + 1)
        .split('\\')
        .join('/')
    )
    .filter(test => {
      const source = readFileSync(join(root, test), 'utf8');
      return FS_READ.test(source) && !LAUNCHES_BROWSER.test(source);
    })
    .sort();
}

/**
 * @param {readonly string[]} changed repo-relative changed paths
 * @param {{ root?: string, tests?: readonly string[] }} [options]
 */
export function selectSourceReadTests(changed, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const tests = options.tests ?? sourceReadTests(root);
  if (changed.length === 0) return [];
  return tests.filter(test => {
    if (changed.includes(test)) return true;
    const keys = [...pathKeys(readFileSync(join(root, test), 'utf8'))];
    return changed.some(file => keys.some(key => keyMatches(key, file)));
  });
}

/**
 * Web-relative unit paths quarantined by the ledger.
 * @param {string} root
 */
function quarantinedPaths(root) {
  const ledger = join(root, WEB, 'tests/quarantine.json');
  if (!existsSync(ledger)) return new Set();
  const { entries = [] } = JSON.parse(readFileSync(ledger, 'utf8'));
  return new Set(
    entries
      .filter((/** @type {{kind: string}} */ entry) => entry.kind === 'unit')
      .map((/** @type {{path: string}} */ entry) => entry.path)
  );
}

/** @param {string[]} args */
async function main(args) {
  const list = args.includes('--list');
  /** @type {string[] | null} */
  let changed = args.filter(arg => !arg.startsWith('--'));
  if (changed.length === 0) {
    const { listAllChangedFiles } = await import('../ci-fast-lanes.mjs');
    // An unreadable diff (null) fails closed onto every source-read test.
    changed = listAllChangedFiles(REPO_ROOT);
  }
  const tests =
    changed === null ? sourceReadTests() : selectSourceReadTests(changed);
  const quarantined = quarantinedPaths(REPO_ROOT);
  const selected = tests
    .map(test => test.slice(WEB.length))
    .filter(test => !quarantined.has(test));
  console.log(
    `[web-source-read-tests] ${selected.length} disk-reading web test(s) name a changed path`
  );
  if (list) {
    for (const test of selected) console.log(test);
    return 0;
  }
  if (selected.length === 0) return 0;
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@jovie/web',
      'run',
      'test:fast',
      '--',
      '--pool=forks',
      '--maxWorkers=4',
      '--fileParallelism',
      '--retry=1',
      ...selected,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' }
  );
  return result.status ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main(process.argv.slice(2));
}
