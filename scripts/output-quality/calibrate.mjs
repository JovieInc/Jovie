#!/usr/bin/env node
// Calibrate the audience-intent judge on known-good and known-bad outputs
// (fixtures/calibration.json; Tim's every-time-zone clock is the anchor
// must-fail case). The output gate may flip from warn to enforce only when
// every case lands on its expected verdict.
//
//   node scripts/output-quality/calibrate.mjs [--write] [--only id,id]
//
// --write records the result in policy.json (`calibration`). It never flips
// `mode` by itself: flipping is a one-line reviewed change that the policy
// test refuses unless the recorded calibration matched every case.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIntentLoop } from './intent-eval.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const POLICY_PATH = join(HERE, 'policy.json');

export function scoreCalibration(results) {
  const matched = results.filter(r => r.verdict === r.expect);
  const mustFailMissed = results.filter(
    r => r.mustFail && r.verdict === 'pass'
  );
  return {
    cases: results.length,
    matched: matched.length,
    allMatched: matched.length === results.length,
    mustFailMissed: mustFailMissed.map(r => r.id),
  };
}

export async function calibrate({ only, loop = runIntentLoop } = {}) {
  const spec = JSON.parse(
    readFileSync(join(HERE, 'fixtures/calibration.json'), 'utf8')
  );
  const cases = spec.cases.filter(c => !only || only.includes(c.id));
  const results = [];
  for (const c of cases) {
    const receipt = await loop({
      mission: c.mission,
      preset: c.preset,
      audience: c.audience,
      kind: c.kind,
      artifact: join(HERE, 'fixtures', c.artifact),
    });
    results.push({
      id: c.id,
      expect: c.expect,
      mustFail: Boolean(c.mustFail),
      verdict: receipt.verdict,
      score: receipt.score,
      runId: receipt.runId,
      topIssue: receipt.passes[0].topIssue,
    });
  }
  return {
    at: new Date().toISOString(),
    results,
    ...scoreCalibration(results),
  };
}

async function main(argv) {
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? argv[onlyAt + 1].split(',') : null;
  const record = await calibrate({ only });
  for (const r of record.results)
    process.stdout.write(
      `${r.verdict === r.expect ? 'ok  ' : 'MISS'} ${r.id}: expected ${r.expect}, got ${r.verdict} (${r.score ?? 'n/a'})\n`
    );
  process.stdout.write(
    `calibration: ${record.matched}/${record.cases} matched${record.mustFailMissed.length ? `; must-fail passed: ${record.mustFailMissed.join(', ')}` : ''}\n`
  );
  if (argv.includes('--write') && !only) {
    const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
    policy.calibration = {
      at: record.at,
      cases: record.cases,
      matched: record.matched,
      allMatched: record.allMatched,
      results: record.results.map(({ topIssue, ...r }) => r),
    };
    writeFileSync(POLICY_PATH, `${JSON.stringify(policy, null, 2)}\n`);
  }
  return record.allMatched ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      process.stderr.write(`calibrate: ${error?.message ?? error}\n`);
      process.exit(2);
    }
  );
