#!/usr/bin/env node
// Test-quality loop driver.
//   node scripts/test-quality-loop.mjs rank [--out ranked.json] [--top 20]
// Ranks apps/web modules by how high-touch they are (config/test-quality/surfaces.json
// tier weight + git churn) so the mutation sweep expands from the top outward.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  aggregateByTier,
  evaluateFloors,
  modelFingerprint,
  modelIds,
  rearmTop,
  survivorMap,
  survivorsKilled,
} from './lib/test-quality-metrics.mjs';
import { parseChurn, rankSurfaces } from './lib/test-quality-rank.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = rel => JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    top: { type: 'string', default: '20' },
    state: { type: 'string' },
    ranked: { type: 'string' },
    update: { type: 'boolean', default: false },
    rearm: { type: 'string', default: '25' },
  },
});

if (positionals[0] === 'rank') {
  const config = JSON.parse(
    readFileSync(join(repoRoot, 'config/test-quality/surfaces.json'), 'utf8')
  );
  const log = spawnSync(
    'git',
    [
      'log',
      `--since=${config.churnWindowDays}.days`,
      '--name-only',
      '--pretty=format:',
      'HEAD',
      '--',
      'apps/web/lib',
      'apps/web/app/api',
      'apps/web/proxy.ts',
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  );
  if (log.status !== 0) throw new Error(`git log failed: ${log.stderr}`);
  const churn = parseChurn(log.stdout);
  const files = Object.keys(churn).filter(
    f => /\.tsx?$/u.test(f) && !/\.(test|stories|d)\./u.test(f)
  );
  const ranked = rankSurfaces(files, churn, config);
  if (values.out)
    writeFileSync(values.out, `${JSON.stringify(ranked, null, 1)}\n`);
  for (const r of ranked.slice(0, Number(values.top)))
    console.log(
      `${String(r.touch).padStart(4)}  ${r.tier.padEnd(14)} ${String(r.commits).padStart(3)}  ${r.file}`
    );
} else if (positionals[0] === 'report' || positionals[0] === 'ratchet') {
  const surfaces = cfg('config/test-quality/surfaces.json');
  const state = JSON.parse(readFileSync(values.state, 'utf8'));
  const byTier = aggregateByTier(state, surfaces);
  const ratchets = cfg('config/test-quality/ratchets.json');
  const { violations, next } = evaluateFloors(
    byTier,
    ratchets.mutationScoreFloor
  );
  if (positionals[0] === 'ratchet') {
    for (const v of violations)
      console.log(
        `${ratchets.mode === 'enforce' ? 'FAIL' : 'WARN'} ${v.tier}: mutation score ${v.score} < floor ${v.floor}`
      );
    if (values.update) {
      ratchets.mutationScoreFloor = next;
      writeFileSync(
        join(repoRoot, 'config/test-quality/ratchets.json'),
        `${JSON.stringify(ratchets, null, 2)}\n`
      );
    }
    process.exitCode = ratchets.mode === 'enforce' && violations.length ? 1 : 0;
  } else {
    const outPath =
      values.out ?? join(repoRoot, 'docs/metrics/test-quality-latest.json');
    const prev = existsSync(outPath)
      ? JSON.parse(readFileSync(outPath, 'utf8'))
      : {};
    const quarantine = cfg('apps/web/tests/quarantine.json');
    const runsPath = `${values.state}.runs.jsonl`;
    const runs = existsSync(runsPath)
      ? readFileSync(runsPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l))
      : [];
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = runs.filter(r => Date.parse(r.at) >= weekAgo);
    const report = {
      schema: 'jovie.test-quality/v1',
      generatedAt: new Date().toISOString(),
      mutationByTier: byTier,
      modulesScored: Object.values(state.modules).filter(
        m => m.status === 'scored'
      ).length,
      survivorsKilledSincePrev: survivorsKilled(prev.survivorsByModule, state),
      testMinutes7d:
        Math.round(recent.reduce((t, r) => t + (r.durationMs ?? 0), 0) / 6000) /
        10,
      modulesScored7d: recent.filter(r => r.status === 'scored').length,
      quarantinedTests: quarantine.entries?.length ?? 0,
      floorViolations: violations,
      survivorsByModule: survivorMap(state),
    };
    writeFileSync(outPath, `${JSON.stringify(report, null, 1)}\n`);
    console.log(
      JSON.stringify({ ...report, survivorsByModule: undefined }, null, 1)
    );
  }
} else if (positionals[0] === 'model-check') {
  // The fingerprint lives in the sweep state (which persists on Gem), so a registry
  // change needs no commit-back: compare, re-arm the top-touch modules, record.
  const state = JSON.parse(readFileSync(values.state, 'utf8'));
  const ids = modelIds(cfg('ops/registry/capacity.json'));
  const fingerprint = modelFingerprint(ids);
  const was = state.modelFingerprint ?? null;
  console.log(
    `model-fingerprint ${fingerprint} (${was === null ? 'first record' : was === fingerprint ? 'unchanged' : 'CHANGED'})`
  );
  if (was !== null && was !== fingerprint) {
    const n = rearmTop(
      state,
      JSON.parse(readFileSync(values.ranked, 'utf8')),
      Number(values.rearm)
    );
    console.log(
      `re-armed ${n} top-touch modules for re-scoring with the new model`
    );
  }
  state.modelFingerprint = fingerprint;
  state.modelIds = ids;
  writeFileSync(values.state, `${JSON.stringify(state)}\n`);
} else {
  console.error('usage: test-quality-loop.mjs rank|report|ratchet|model-check');
  process.exit(2);
}
