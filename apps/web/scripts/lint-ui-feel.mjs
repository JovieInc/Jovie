#!/usr/bin/env node
/**
 * UI-feel ratchet guard (JOV-8197, epic JOV-3371).
 *
 * Runs the `@jovie/ui-feel` ESLint rule (eslint-rules/ui-feel.js, JOV-8196)
 * over every web JSX source file and ratchets the per-check counts against
 * ui-feel-ratchet.baseline.json. The rule is off in the shared eslint config
 * (legacy debt would fail every touched file); this guard is the repo-wide
 * gate that fails when any check's count grows past its recorded baseline,
 * so pre-existing violations are captured exactly once and new ones block.
 *
 * Checks ratcheted (see eslint-rules/ui-feel.js for heuristics):
 *   headingNeedsBalance — <h1>-<h6> without text-wrap balance
 *   missingTabularNums  — leaf numeral displays without `tabular-nums`
 *   nonConcentricRadius — child radius larger than its parent's
 *   undersizedHitArea   — interactive targets under the 40x40px floor
 *
 * Ordering: while the JOV-8196 rule is not yet on main (eslint.config.js
 * does not register '@jovie/ui-feel'), the guard reports a skip and exits 0.
 * A config that registers the rule while the rule file is missing is a
 * broken state and fails closed.
 *
 * Rules:
 *   - Each count must NEVER exceed the baseline in
 *     ui-feel-ratchet.baseline.json.
 *   - The committed baseline must track the debt exactly. A count below its
 *     baseline is stale headroom and fails the gate too, matching the
 *     merge-group exact-match test ('committed baseline matches current debt
 *     without regression headroom'). That test only runs in merge-group unit
 *     shards, so before this gate failed in both directions a PR could shrink
 *     debt without regenerating the baseline, stay green on PR CI, and then
 *     eject its merge group on the queue (JOV-8878). Either direction: rerun
 *     with `--update` and commit the file.
 *
 * PR time: the CI workflow (and this ratchet) only runs in the merge group,
 * so Source Validation's lint:eslint:changed calls `--changed <baseRef>`,
 * which fails on any ui-feel violation on a line the PR adds. Untouched
 * legacy lines stay owned by the baseline, so editing a file never forces
 * cleaning its debt.
 *
 * Usage:
 *   node scripts/lint-ui-feel.mjs            # check only
 *   node scripts/lint-ui-feel.mjs --changed origin/main  # added lines only
 *   node scripts/lint-ui-feel.mjs --list     # print file:line locations
 *   node scripts/lint-ui-feel.mjs --update   # lower the baseline
 *
 * Exit 0 = counts match the baseline exactly. Exit 1 = regression beyond
 * the baseline, or stale headroom (debt shrank without `--update`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const BASELINE_PATH = join(projectRoot, 'ui-feel-ratchet.baseline.json');
const RULE_PATH = join(projectRoot, 'eslint-rules', 'ui-feel.js');
const ESLINT_CONFIG_PATH = join(projectRoot, 'eslint.config.js');

export const SCAN_GLOBS = [
  'app/**/*.tsx',
  'components/**/*.tsx',
  'hooks/**/*.tsx',
  'lib/**/*.tsx',
];

export const BASELINE_KEYS = [
  'headingNeedsBalance',
  'missingTabularNums',
  'nonConcentricRadius',
  'undersizedHitArea',
];

const RULE_ID = '@jovie/ui-feel';

const require = createRequire(import.meta.url);

// ── rule loading ───────────────────────────────────────────────────────────

function eslintConfigRegistersRule() {
  if (!existsSync(ESLINT_CONFIG_PATH)) return false;
  return readFileSync(ESLINT_CONFIG_PATH, 'utf8').includes('ui-feel');
}

export function loadUiFeelRule() {
  if (existsSync(RULE_PATH)) {
    return require(RULE_PATH);
  }
  if (eslintConfigRegistersRule()) {
    throw new Error(
      'eslint.config.js registers @jovie/ui-feel but eslint-rules/ui-feel.js is missing'
    );
  }
  return null;
}

// ── scanning ───────────────────────────────────────────────────────────────

async function createEslint(rule, cwd = projectRoot) {
  const { ESLint } = await import('eslint');
  const tsParser = (await import('@typescript-eslint/parser')).default;
  return new ESLint({
    cwd,
    // Only this rule runs: the ratchet measures ui-feel violations, not the
    // rest of the flat config (changed-file ESLint already enforces those).
    overrideConfigFile: true,
    baseConfig: [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaFeatures: { jsx: true },
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: { '@jovie': { rules: { 'ui-feel': rule } } },
        rules: { [RULE_ID]: 'error' },
      },
    ],
  });
}

export async function collectViolations({
  rule = loadUiFeelRule(),
  patterns = SCAN_GLOBS,
  cwd = projectRoot,
} = {}) {
  if (!rule || patterns.length === 0) return [];
  const eslint = await createEslint(rule, cwd);
  const results = await eslint.lintFiles(patterns);
  const violations = [];
  for (const result of results) {
    for (const message of result.messages ?? []) {
      if (message.ruleId !== RULE_ID) continue;
      violations.push({
        file: relative(cwd, result.filePath).replaceAll('\\', '/'),
        line: message.line ?? 0,
        messageId: message.messageId ?? 'unknown',
      });
    }
  }
  violations.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.messageId.localeCompare(b.messageId)
  );
  return violations;
}

export function countByCheck(violations) {
  const counts = Object.fromEntries(BASELINE_KEYS.map(key => [key, 0]));
  for (const violation of violations) {
    if (violation.messageId in counts) {
      counts[violation.messageId] += 1;
    } else {
      counts[violation.messageId] = (counts[violation.messageId] ?? 0) + 1;
    }
  }
  return counts;
}

// ── added lines (PR-time gate) ─────────────────────────────────────────────

const SCANNED_FILE = /^(app|components|hooks|lib)\/.+\.tsx$/;

/**
 * Parse `git diff -U0` output into web-root-relative file -> added line
 * numbers, keeping only files the ratchet scans.
 */
export function addedLines(diffStdout) {
  const added = new Map();
  let file = null;
  for (const line of diffStdout.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '');
      const rel = path.startsWith('apps/web/') ? path.slice(9) : null;
      file = rel && SCANNED_FILE.test(rel) ? rel : null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !file) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    const lines = added.get(file) ?? new Set();
    for (let n = start; n < start + count; n += 1) lines.add(n);
    added.set(file, lines);
  }
  return added;
}

export function violationsOnAddedLines(violations, added) {
  return violations.filter(violation =>
    added.get(violation.file)?.has(violation.line)
  );
}

export async function checkChanged({
  baseRef,
  rule,
  collect = collectViolations,
  spawn = spawnSync,
  log = console.log,
  error = console.error,
  webRoot = projectRoot,
}) {
  const diff = spawn(
    'git',
    [
      'diff',
      '-U0',
      '--diff-filter=ACMR',
      `${baseRef}...HEAD`,
      '--',
      'apps/web',
    ],
    {
      cwd: join(webRoot, '..', '..'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }
  );
  if (diff.status !== 0) {
    error(`[lint:ui-feel] could not diff against ${baseRef}`);
    return 1;
  }
  const added = addedLines(diff.stdout);
  const files = [...added.keys()].filter(file =>
    existsSync(join(webRoot, file))
  );
  const fresh = violationsOnAddedLines(
    await collect({ rule, patterns: files, cwd: webRoot }),
    added
  );
  if (fresh.length === 0) {
    log(
      `[lint:ui-feel] ok — no violations on added lines (${files.length} changed file(s))`
    );
    return 0;
  }
  error('[lint:ui-feel] new violations on lines this change adds:');
  for (const violation of fresh) {
    error(`  ${violation.file}:${violation.line}  ${violation.messageId}`);
  }
  error(
    '[lint:ui-feel] see eslint-rules/ui-feel.js for each check and its fix.'
  );
  return 1;
}

// ── baseline ───────────────────────────────────────────────────────────────

export function readBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const { _comment, ...counts } = parsed;
  return counts;
}

export function regressions(current, baseline) {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...keys]
    .filter(key => key !== '_comment')
    .map(key => ({
      check: key,
      baseline: baseline[key] ?? 0,
      current: current[key] ?? 0,
    }))
    .filter(entry => entry.current > entry.baseline);
}

/**
 * Baseline entries whose debt shrank below the committed floor. Stale
 * headroom: a future regression could hide inside the slack, so the gate
 * fails until `--update` re-locks the floor to the measured debt.
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @returns {Array<{check: string, baseline: number, current: number}>}
 */
export function staleBaseline(current, baseline) {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...keys]
    .filter(key => key !== '_comment')
    .map(key => ({
      check: key,
      baseline: baseline[key] ?? 0,
      current: current[key] ?? 0,
    }))
    .filter(entry => entry.current < entry.baseline);
}

export function writeBaseline(counts, path = BASELINE_PATH) {
  const sorted = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map(key => [key, counts[key]])
  );
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        _comment:
          'UI-feel ratchet baseline — per-check counts of @jovie/ui-feel violations (JOV-8197). To change: fix violations then run `pnpm --filter web lint:ui-feel -- --update` (or `node scripts/lint-ui-feel.mjs --update`) and commit this file. CI fails if any count drifts from its baseline in either direction — growth is a regression, and shrink without this update is stale headroom.',
        ...sorted,
      },
      null,
      2
    )}\n`
  );
}

// ── cli ────────────────────────────────────────────────────────────────────

export async function main(
  argv = process.argv.slice(2),
  log = console.log,
  {
    loadRule = loadUiFeelRule,
    collect = collectViolations,
    baselinePath = BASELINE_PATH,
    spawn = spawnSync,
  } = {}
) {
  const isUpdate = argv.includes('--update');
  const changedIndex = argv.indexOf('--changed');
  const isList = argv.includes('--list');

  let rule;
  try {
    rule = loadRule();
  } catch (error) {
    console.error(`[lint:ui-feel] ${error.message}`);
    return 1;
  }
  if (!rule) {
    log(
      '[lint:ui-feel] @jovie/ui-feel is not registered in eslint.config.js ' +
        'and eslint-rules/ui-feel.js is absent — nothing to ratchet yet.'
    );
    return 0;
  }

  if (changedIndex !== -1) {
    const baseRef = argv[changedIndex + 1];
    if (!baseRef) {
      console.error('[lint:ui-feel] --changed needs a base ref');
      return 1;
    }
    return checkChanged({ baseRef, rule, collect, spawn, log });
  }

  const violations = await collect({ rule });
  const counts = countByCheck(violations);

  if (isList) {
    for (const violation of violations) {
      log(`  ${violation.file}:${violation.line}  ${violation.messageId}`);
    }
  }

  if (isUpdate || !existsSync(baselinePath)) {
    writeBaseline(counts, baselinePath);
    log(
      `[lint:ui-feel] baseline ${isUpdate ? 'updated' : 'written'}: ${JSON.stringify(counts)}`
    );
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  const failures = regressions(counts, baseline);
  const stale = staleBaseline(counts, baseline);
  if (failures.length === 0 && stale.length === 0) {
    log(
      `[lint:ui-feel] ok — counts within baseline: ${JSON.stringify(counts)}`
    );
    return 0;
  }

  if (failures.length > 0) {
    console.error('[lint:ui-feel] regression beyond baseline:');
    for (const failure of failures) {
      console.error(
        `  ${failure.check}: ${failure.current} > baseline ${failure.baseline}`
      );
    }
    console.error(
      '[lint:ui-feel] fix the new violations, or rerun with --list for locations.'
    );
  }
  if (stale.length > 0) {
    console.error(
      '[lint:ui-feel] baseline stale — debt shrank below the committed baseline (headroom):'
    );
    for (const entry of stale) {
      console.error(
        `  ${entry.check}: ${entry.current} < baseline ${entry.baseline}`
      );
    }
    console.error(
      '[lint:ui-feel] rerun with --update and commit ui-feel-ratchet.baseline.json so the floor follows the debt (JOV-8197).'
    );
  }
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(code => {
    process.exitCode = code;
  });
}
