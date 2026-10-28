#!/usr/bin/env node
// Turbo remote-cache hit rate for GitHub Actions runs, from job logs.
// Usage: node scripts/turbo-cache-hit-rate.mjs <runId> [<runId> ...]
// Also counts which cache backend jobs selected ("turbo-cache: backend=...").
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const totals = { cached: 0, total: 0, runs: 0 };
const backends = {};

for (const runId of process.argv.slice(2)) {
  let log = '';
  try {
    log = execFileSync('gh', ['run', 'view', runId, '-R', repo, '--log'], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    console.error(`run ${runId}: log unavailable`);
    continue;
  }
  let cached = 0;
  let total = 0;
  for (const m of log.matchAll(/Cached:\s+(\d+) cached, (\d+) total/g)) {
    cached += Number(m[1]);
    total += Number(m[2]);
  }
  for (const m of log.matchAll(/turbo-cache: backend=(\S+)/g)) {
    backends[m[1]] = (backends[m[1]] ?? 0) + 1;
  }
  totals.cached += cached;
  totals.total += total;
  totals.runs += 1;
  const rate = total ? ((100 * cached) / total).toFixed(1) : 'n/a';
  console.log(`run ${runId}: ${cached}/${total} tasks cached (${rate}%)`);
}
const rate = totals.total
  ? ((100 * totals.cached) / totals.total).toFixed(1)
  : 'n/a';
console.log(
  `TOTAL runs=${totals.runs} cached=${totals.cached}/${totals.total} hit_rate=${rate}% backends=${JSON.stringify(backends)}`
);
