#!/usr/bin/env node
// Collect a sampled window of recent workflow jobs, summarize hosted queue wait
// and control-plane spend, and write docs/metrics/ci-capacity-latest.json.
// Exit 2 when hosted queue wait p95 exceeds the alarm threshold.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeCapacity } from './lib/ci-capacity.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const windowMinutes = Number(arg('--minutes', '15'));
const maxRuns = Number(arg('--max-runs', '120'));
const out = arg('--out', 'docs/metrics/ci-capacity-latest.json');
const API_CLIENT_CLI = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/api-client/cli.ts'
);
const gh = args =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [API_CLIENT_CLI, 'gh', '--priority', 'report', '--', 'api', ...args],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );

const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
const runs = [];
for (let page = 1; page <= 10; page++) {
  const body = gh([
    `repos/${repo}/actions/runs?created=>=${since}&per_page=100&page=${page}`,
  ]);
  runs.push(...body.workflow_runs);
  if (body.workflow_runs.length < 100) break;
}
// Uniform sample keeps the hourly collector far below the API budget.
const step = Math.max(1, Math.ceil(runs.length / maxRuns));
const sample = runs.filter((_, i) => i % step === 0);
const jobs = [];
for (const run of sample) {
  const body = gh([`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`]);
  for (const j of body.jobs) {
    const skippedSteps = (j.steps ?? []).filter(
      s => s.conclusion === 'skipped'
    ).length;
    jobs.push({
      workflow: run.name,
      status: j.status,
      conclusion: j.conclusion,
      created_at: j.created_at,
      started_at: j.started_at,
      completed_at: j.completed_at,
      labels: j.labels,
      noop:
        j.conclusion === 'cancelled' ||
        (j.conclusion === 'success' &&
          (j.steps ?? []).length > 0 &&
          skippedSteps >= (j.steps ?? []).length - 3),
    });
  }
}
const summary = summarizeCapacity(jobs, {
  windowHours: windowMinutes / 60,
  sampleRatio: sample.length / Math.max(1, runs.length),
});
summary.sampledRuns = sample.length;
summary.totalRuns = runs.length;
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (summary.alarm.firing) {
  console.log(
    `::error::hosted queue wait p95 ${summary.hostedQueueSeconds.p95}s exceeds ${summary.alarm.threshold}s`
  );
  process.exitCode = 2;
}
