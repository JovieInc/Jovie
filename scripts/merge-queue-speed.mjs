#!/usr/bin/env node
// Merge-queue speed baseline (24h by default): PR CI and merge-group CI
// p50/p95, group success (2h/6h/24h), critical-path jobs, enqueue-to-merge
// wait, merges/hour and merge-group runner-minutes per merge.
// Writes docs/metrics/merge-queue-speed-latest.json; shipping-slo embeds its
// digest block in the lanes status gist that Summer reads.
// api-budget: github-app-core 220/hr - once a day from shipping-slo: <=20 run-list pages + <=200 job reads (11/hr averaged)
// api-budget: github-app-graphql 10/hr - once a day: <=5 search pages for merged PRs and their enqueue events
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './lib/merge-queue-speed.mjs';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
const [owner, name] = repo.split('/');
const hours = Number(arg('--hours', '24'));
const maxJobs = Number(arg('--max-jobs', '200'));
const out = arg('--out', 'docs/metrics/merge-queue-speed-latest.json');
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

const now = Date.now();
const since = new Date(now - hours * 3_600_000).toISOString();

function listRuns(workflow, event) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const body = gh([
      `repos/${repo}/actions/workflows/${workflow}/runs?event=${event}&created=>=${since}&per_page=100&page=${page}`,
    ]);
    runs.push(...body.workflow_runs);
    if (body.workflow_runs.length < 100) break;
  }
  return runs;
}

const groupRuns = listRuns('ci.yml', 'merge_group');
const prRuns = listRuns('source-validation.yml', 'pull_request');

// Uniform sample of completed merge-group runs for job-level timing.
const completed = groupRuns.filter(r => r.status === 'completed');
const step = Math.max(1, Math.ceil(completed.length / maxJobs));
const sampledGroupJobs = completed
  .filter((_, i) => i % step === 0)
  .map(run => ({
    run,
    jobs: gh([`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`]).jobs,
  }));

const query = `query($q:String!,$after:String){search(query:$q,type:ISSUE,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{...on PullRequest{number mergedAt timelineItems(itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT],last:10){nodes{...on AddedToMergeQueueEvent{createdAt}}}}}}}`;
const mergedPrs = [];
let after = null;
for (let page = 0; page < 5; page++) {
  const args = [
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `q=repo:${repo} is:pr is:merged merged:>=${since.slice(0, 19)}Z`,
  ];
  if (after) args.push('-f', `after=${after}`);
  const body = gh(args).data.search;
  for (const pr of body.nodes) {
    mergedPrs.push({
      number: pr.number,
      mergedAt: pr.mergedAt,
      enqueuedAt: pr.timelineItems.nodes.map(n => n.createdAt),
    });
  }
  if (!body.pageInfo.hasNextPage) break;
  after = body.pageInfo.endCursor;
}

const summary = summarize({
  prRuns,
  groupRuns,
  sampledGroupJobs,
  mergedPrs,
  now,
  windowHours: hours,
});
summary.repo = `${owner}/${name}`;
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
const m = s => (s === null ? 'n/a' : `${(s / 60).toFixed(1)}m`);
process.stdout.write(
  [
    `## Merge-queue speed (${hours}h)`,
    `- merges/h ${summary.mergesPerHour} (${summary.merges})`,
    `- group success ${summary.groupSuccessRate} (2h ${summary.batchSizeGate.success2h})`,
    `- merge-group CI p50 ${m(summary.mergeGroupCiSeconds.p50)} p95 ${m(summary.mergeGroupCiSeconds.p95)}`,
    `- PR CI p50 ${m(summary.prCiSeconds.p50)} p95 ${m(summary.prCiSeconds.p95)}`,
    `- queue wait p50 ${m(summary.queueWaitSeconds.p50)} p95 ${m(summary.queueWaitSeconds.p95)}`,
    `- runner-min/merge ${summary.mergeGroupRunnerMinutesPerMerge}`,
    ...summary.criticalPath.map(
      j => `- ${j.name}: p50 ${m(j.p50)} last ${j.lastShare}`
    ),
    '',
  ].join('\n')
);
