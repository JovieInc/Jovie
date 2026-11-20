#!/usr/bin/env node
// Test-hygiene ratchet: fails when a test file gains a slop pattern that mutation
// testing can't see (scripts/lib/test-hygiene.mjs lists them, plus the landmine
// rules in scripts/lib/test-hygiene-landmines.mjs). Existing findings are counted
// per file and rule in scripts/test-quality/test-hygiene-baseline.json and
// test-hygiene-landmines.ratchet.json; counts may only go down. Focused tests and
// a test mocking its own unit under test are never allowed.
//
//   node scripts/test-hygiene.mjs              # check every tracked test file
//   node scripts/test-hygiene.mjs --tighten    # lower the baseline after a cleanup
//   node scripts/test-hygiene.mjs --report     # counts per rule, as JSON
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  compareToBaseline,
  countFindings,
  isScannedTestFile,
  isUnitSuite,
  lowerBaseline,
  RULES,
  scanTestFile,
  TEST_FILE_GLOBS,
} from './lib/test-hygiene.mjs';
import {
  LANDMINE_RULES,
  loadRatchet,
  tightenRatchet,
} from './lib/test-hygiene-landmines.mjs';

const ALL_RULES = { ...RULES, ...LANDMINE_RULES };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(
  repoRoot,
  'scripts/test-quality/test-hygiene-baseline.json'
);
const { values } = parseArgs({
  options: {
    tighten: { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
  },
});

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--', ...TEST_FILE_GLOBS],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }
)
  .split('\0')
  .filter(isScannedTestFile);

/** @type {Record<string, { rule: string, line: number, name: string }[]>} */
const findingsByFile = {};
for (const file of files) {
  const path = join(repoRoot, file);
  if (!existsSync(path)) continue;
  const findings = scanTestFile(file, readFileSync(path, 'utf8'), {
    unit: isUnitSuite(file),
  });
  if (findings.length > 0) findingsByFile[file] = findings;
}
const current = countFindings(findingsByFile);
const baseline = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : { schemaVersion: 1, counts: {} };

if (values.report) {
  /** @type {Record<string, { findings: number, files: number }>} */
  const byRule = {};
  for (const [rule, perFile] of Object.entries(current)) {
    const counts = Object.values(perFile);
    byRule[rule] = {
      findings: counts.reduce((a, b) => a + b, 0),
      files: counts.length,
    };
  }
  console.log(JSON.stringify({ scannedFiles: files.length, byRule }, null, 1));
} else if (values.tighten) {
  baseline.counts = lowerBaseline(baseline.counts, current);
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  tightenRatchet(repoRoot, current);
  console.log(
    'test-hygiene: baseline lowered to current counts (never raised).'
  );
} else {
  const failures = compareToBaseline(
    { ...baseline.counts, ...loadRatchet(repoRoot) },
    current
  );
  if (failures.length === 0) {
    console.log(`test-hygiene: ${files.length} test files, no new findings.`);
  } else {
    for (const f of failures) {
      console.error(
        `${f.file}: ${f.rule} ${f.count} (allowed ${f.allowed}): ${ALL_RULES[f.rule]}`
      );
      for (const hit of (findingsByFile[f.file] ?? []).filter(
        h => h.rule === f.rule
      ))
        console.error(`  line ${hit.line}: ${hit.name}`);
    }
    console.error(
      `\ntest-hygiene: ${failures.length} file/rule pair(s) grew. Fix the test; the baseline only goes down (node scripts/test-hygiene.mjs --tighten after a cleanup).`
    );
    process.exitCode = 1;
  }
}
