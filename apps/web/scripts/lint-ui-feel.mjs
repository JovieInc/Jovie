#!/usr/bin/env node
/**
 * UI-feel ratchet guard (JOV-8197, epic JOV-3371).
 *
 * Runs the `@jovie/ui-feel` ESLint rule (eslint-rules/ui-feel.js, JOV-8196)
 * over every web JSX source file and ratchets the per-check counts against
 * ui-feel-ratchet.baseline.json. The rule runs at error severity but CI only
 * lints *changed* files (scripts/lint-eslint-changed.mjs); this guard is the
 * repo-wide twin that fails when any check's count grows past its recorded
 * baseline, so pre-existing violations are captured exactly once and new
 * ones block the PR.
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
 *   - If a count drops below baseline, update it with `--update` and commit.
 *
 * Usage:
 *   node scripts/lint-ui-feel.mjs            # check only
 *   node scripts/lint-ui-feel.mjs --list     # print file:line locations
 *   node scripts/lint-ui-feel.mjs --update   # lower the baseline
 *
 * Exit 0 = all counts <= baseline. Exit 1 = regression detected.
 */

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

async function createEslint(rule) {
  const { ESLint } = await import('eslint');
  const tsParser = (await import('@typescript-eslint/parser')).default;
  return new ESLint({
    cwd: projectRoot,
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

export async function collectViolations({ rule = loadUiFeelRule() } = {}) {
  if (!rule) return [];
  const eslint = await createEslint(rule);
  const results = await eslint.lintFiles(SCAN_GLOBS);
  const violations = [];
  for (const result of results) {
    for (const message of result.messages ?? []) {
      if (message.ruleId !== RULE_ID) continue;
      violations.push({
        file: relative(projectRoot, result.filePath).replaceAll('\\', '/'),
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

function writeBaseline(counts) {
  const sorted = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map(key => [key, counts[key]])
  );
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        _comment:
          'UI-feel ratchet baseline — per-check counts of @jovie/ui-feel violations (JOV-8197). To reduce: fix violations then run `pnpm --filter web lint:ui-feel -- --update` (or `node scripts/lint-ui-feel.mjs --update`) and commit this file. CI fails if any count exceeds its baseline.',
        ...sorted,
      },
      null,
      2
    )}\n`
  );
}

// ── cli ────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2), log = console.log) {
  const isUpdate = argv.includes('--update');
  const isList = argv.includes('--list');

  let rule;
  try {
    rule = loadUiFeelRule();
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

  const violations = await collectViolations({ rule });
  const counts = countByCheck(violations);

  if (isList) {
    for (const violation of violations) {
      log(`  ${violation.file}:${violation.line}  ${violation.messageId}`);
    }
  }

  if (isUpdate || !existsSync(BASELINE_PATH)) {
    writeBaseline(counts);
    log(
      `[lint:ui-feel] baseline ${isUpdate ? 'updated' : 'written'}: ${JSON.stringify(counts)}`
    );
    return 0;
  }

  const baseline = readBaseline();
  const failures = regressions(counts, baseline);
  if (failures.length === 0) {
    log(
      `[lint:ui-feel] ok — counts within baseline: ${JSON.stringify(counts)}`
    );
    return 0;
  }

  console.error('[lint:ui-feel] regression beyond baseline:');
  for (const failure of failures) {
    console.error(
      `  ${failure.check}: ${failure.current} > baseline ${failure.baseline}`
    );
  }
  console.error(
    '[lint:ui-feel] fix the new violations, or rerun with --list for locations.'
  );
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
