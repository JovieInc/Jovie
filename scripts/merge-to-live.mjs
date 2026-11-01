#!/usr/bin/env node
// Writes docs/metrics/merge-to-live-latest.json for Summer's digest.
// Usage: node scripts/merge-to-live.mjs [--runs 40] [--limit 10] [--no-write]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digestBlock, promotionRows, summarize } from './lib/merge-to-live.mjs';

const args = process.argv.slice(2);
const arg = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const repo = process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie';
const gh = path =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));

const maxRuns = Number(arg('--runs', 40));
const limit = Number(arg('--limit', 10));
const listed = gh(
  `repos/${repo}/actions/workflows/production-controller.yml/runs?per_page=${maxRuns}&status=completed`
).workflow_runs;

const runs = [];
for (const run of listed) {
  const sha = /Controller ([0-9a-f]{40})/.exec(run.display_title ?? '')?.[1];
  if (!sha) continue;
  const jobs = gh(
    `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&filter=latest`
  ).jobs;
  if (
    !jobs.some(
      j => /Promote to Production$/.test(j.name) && j.conclusion === 'success'
    )
  )
    continue;
  const mergedAt = gh(`repos/${repo}/commits/${sha}`).commit.committer.date;
  runs.push({ run, jobs, mergedAt });
  if (runs.length >= limit * 2) break;
}

const summary = summarize(promotionRows(runs), { limit });
console.log(digestBlock(summary));
if (!args.includes('--no-write'))
  writeFileSync(
    resolve(import.meta.dirname, '../docs/metrics/merge-to-live-latest.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );
