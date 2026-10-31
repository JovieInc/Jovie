#!/usr/bin/env node
// Turbo remote-cache hit rate for named GitHub Actions runs, from job logs.
// Usage: node scripts/turbo-cache-hit-rate.mjs <runId> [<runId> ...]
// The CI timing collector records the same numbers as turbo_cache rows on a
// sample of runs; this CLI is for ad-hoc before/after comparisons.
import { runGh } from '../packages/api-client/gh.ts';
import {
  laneName,
  parseTurboCacheLog,
  summarizeHitRate,
} from './lib/turbo-cache-stats.mjs';

const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
/** @type {Array<{ job_name: string, tasks_cached: number, tasks_total: number }>} */
const rows = [];
const backends = /** @type {Record<string, number>} */ ({});

for (const runId of process.argv.slice(2)) {
  // gh run view --log prefixes each line with "<job>\t<step>\t".
  const result = await runGh(['run', 'view', runId, '-R', repo, '--log'], {
    priority: 'report',
  });
  if (result.deferred || result.code !== 0) {
    console.error(`run ${runId}: log unavailable (${result.code})`);
    continue;
  }
  const log = result.stdout;
  /** @type {Map<string, string[]>} */
  const byJob = new Map();
  for (const line of log.split('\n')) {
    const job = line.split('\t', 1)[0];
    if (!byJob.has(job)) byJob.set(job, []);
    byJob.get(job)?.push(line);
  }
  for (const [job, lines] of byJob) {
    const stats = parseTurboCacheLog(lines.join('\n'));
    if (stats.backend)
      backends[stats.backend] = (backends[stats.backend] ?? 0) + 1;
    if (!stats.tasksTotal) continue;
    rows.push({
      job_name: job,
      tasks_cached: stats.tasksCached,
      tasks_total: stats.tasksTotal,
    });
    console.log(
      `run ${runId} ${laneName(job)}: ${stats.tasksCached}/${stats.tasksTotal} cached backend=${stats.backend ?? (stats.remoteDisabled ? 'none' : '?')}`
    );
  }
}
const summary = summarizeHitRate(rows);
console.log(
  `TOTAL cached=${summary.cached}/${summary.total} hit_rate=${summary.hitRate === null ? 'n/a' : `${(100 * summary.hitRate).toFixed(1)}%`} backends=${JSON.stringify(backends)}`
);
