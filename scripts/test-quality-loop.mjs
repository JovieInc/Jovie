#!/usr/bin/env node
// Test-quality loop driver.
//   node scripts/test-quality-loop.mjs rank [--out ranked.json] [--top 20]
// Ranks apps/web modules by how high-touch they are (config/test-quality/surfaces.json
// tier weight + git churn) so the mutation sweep expands from the top outward.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseChurn, rankSurfaces } from './lib/test-quality-rank.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' }, top: { type: 'string', default: '20' } },
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
} else {
  console.error('usage: test-quality-loop.mjs rank [--out f] [--top n]');
  process.exit(2);
}
