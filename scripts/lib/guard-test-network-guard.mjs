/**
 * Guard-test network contract — JOV-13105.
 *
 * Guard tests (the CI contract suites under .github/scripts and scripts) must
 * run hermetically: no live api.github.com calls, no gh subprocess, no curl
 * to GitHub (recorded instances: SV runs 44554154244 and 44553058867, whose
 * guard steps 403'd on quota). Existing call sites are grandfathered per
 * (file, rule) count in the ratchet: growth fails, a drop is tolerated until
 * the ratchet is re-locked with --write, so a main-side cleanup never
 * false-reds an unrelated PR. Runtime source is already covered by
 * external-api-guard, which deliberately excludes tests.
 */ import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RATCHET_PATH = 'scripts/lib/guard-test-network.ratchet.gen.json';
export const RATCHET_SCHEMA = 'jovie-guard-test-network-ratchet/v1';

/** The scanner never scans itself or its own test. */
const SELF = /guard-test-network-guard/;

const TEST_FILE = /\.test\.[cm]?[jt]s$/;
const IN_GUARD_HOME =
  /(?:^|\/)(?:\.github\/scripts|scripts)\/|(?:^|\/)__tests__\//;

export function buildRules() {
  return [
    {
      id: 'provider-host',
      pattern: /api\.github\.com/g,
      fix: 'stub or inject the API response; a guard test must not reach api.github.com',
    },
    {
      id: 'gh-subprocess',
      pattern:
        /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\(\s*['"`]gh\b|gh\s+(?:api|pr|issue|run|search|release|workflow|repo)\b/g,
      fix: 'inject a fake execute/api function; a guard test must not shell out to gh',
    },
    {
      id: 'curl-github',
      pattern: /curl\b[^\n]*github(?:\.com|api)/gi,
      fix: 'stub or inject the response; a guard test must not curl GitHub',
    },
  ];
}

export function inScope(path) {
  return TEST_FILE.test(path) && IN_GUARD_HOME.test(path) && !SELF.test(path);
}

/** Per-file, per-rule hit counts with line numbers for the error message. */
export function scanSource(path, text, rules = buildRules()) {
  const hits = {};
  for (const rule of rules) {
    for (const match of text.matchAll(rule.pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      const row = (hits[rule.id] ??= { count: 0, lines: [] });
      row.count += 1;
      if (row.lines.length < 3) row.lines.push(line);
    }
  }
  return hits;
}

export function scanRepo(repoRoot, rules = buildRules()) {
  const tracked = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .stdout.split('\0')
    .filter(Boolean);
  const found = {};
  for (const path of tracked) {
    if (!inScope(path)) continue;
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch {
      continue;
    }
    const hits = scanSource(path, text, rules);
    if (Object.keys(hits).length) found[path] = hits;
  }
  return found;
}

/** Flat {path: {rule: count}} view of a scan. */
export function countsOf(found) {
  const counts = {};
  for (const [path, hits] of Object.entries(found)) {
    for (const [rule, row] of Object.entries(hits))
      (counts[path] ??= {})[rule] = row.count;
  }
  return counts;
}

/**
 * Growth fails. Shrinks are reported but do not fail: floors tighten only
 * through --write, never by blocking an unrelated PR.
 * @returns {string[]} errors; empty means the tree honors the contract.
 */
export function checkGuard(found, ratchet) {
  const errors = [];
  for (const [path, hits] of Object.entries(found)) {
    for (const [rule, row] of Object.entries(hits)) {
      const ceiling = ratchet[path]?.[rule] ?? 0;
      if (row.count > ceiling)
        errors.push(
          `${path}:${row.lines.join(',')} ${rule}: ${row.count} live call(s), ${ceiling} grandfathered. ` +
            `Fix: ${row.fix}`
        );
    }
  }
  return errors;
}

/** Locks floors at the measured counts (never raises above the ratchet). */
export function writeRatchet(ratchet, found) {
  const counts = countsOf(found);
  const next = { schema: RATCHET_SCHEMA, entries: {} };
  for (const path of new Set([
    ...Object.keys(ratchet.entries ?? {}),
    ...Object.keys(counts),
  ])) {
    const before = ratchet.entries?.[path] ?? {};
    const now = counts[path] ?? {};
    const merged = {};
    for (const rule of new Set([...Object.keys(before), ...Object.keys(now)]))
      merged[rule] = Math.min(before[rule] ?? 0, now[rule] ?? 0);
    if (Object.keys(merged).length) next.entries[path] = merged;
  }
  return next;
}
