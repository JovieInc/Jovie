#!/usr/bin/env node
// Golden Path assurance ratchet check (JOV-7998).
//
//   node scripts/golden-path-assurance.mjs            # check against baseline
//   node scripts/golden-path-assurance.mjs measure    # print the measurement
//   node scripts/golden-path-assurance.mjs rank [--stage-counts counts.json]
//
// Exit 1 on any regression. See scripts/lib/golden-path-assurance.mjs.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkMapRatchet,
  checkModuleBaselines,
  measureCoverageMap,
  parseCoverageMap,
  rankModules,
  unresolvedReferences,
} from './lib/golden-path-assurance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));

export function runCheck() {
  const rows = parseCoverageMap(
    readFileSync(join(repoRoot, 'docs/golden-path/coverage-map.md'), 'utf8')
  );
  const tracked = spawnSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .stdout.split('\n')
    .filter(Boolean);
  const baseline = readJson('scripts/golden-path-assurance-baseline.json');
  const measured = measureCoverageMap(rows);
  return {
    measured,
    failures: [
      ...checkMapRatchet(measured, baseline),
      ...unresolvedReferences(rows, tracked),
      ...checkModuleBaselines(
        readJson('scripts/golden-path-assurance.json'),
        readJson('scripts/mutation-score-baseline.json'),
        baseline
      ),
    ],
  };
}

if (import.meta.filename === process.argv[1]) {
  const [command = 'check', ...rest] = process.argv.slice(2);
  if (command === 'rank') {
    const flag = rest.indexOf('--stage-counts');
    const counts =
      flag >= 0 ? JSON.parse(readFileSync(rest[flag + 1], 'utf8')) : {};
    for (const entry of rankModules(
      readJson('scripts/golden-path-assurance.json'),
      counts
    )) {
      console.log(`${entry.score}\t${entry.stage}\t${entry.path}`);
    }
  } else {
    const { measured, failures } = runCheck();
    if (command === 'measure') {
      console.log(JSON.stringify(measured, null, 2));
    } else if (failures.length > 0) {
      for (const failure of failures) console.error(`::error::${failure}`);
      process.exit(1);
    } else {
      console.log(
        `golden-path assurance ok: ${measured.rows} rows, ${measured.real} real, ${measured.missing} missing`
      );
    }
  }
}
