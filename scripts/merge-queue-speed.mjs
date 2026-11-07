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

export function collect({
  gh,
  repo,
  now = Date.now(),
  hours = 24,
  maxJobs = 200,
  collectionId = null,
}) {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
    throw new Error('--hours must be > 0 and <= 24');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 200)
    throw new Error('--max-jobs must be an integer from 1 to 200');
  const completeness = {};
  // Always cover the advertised 24h/6h/2h windows; caps remain unchanged.
  const collectionHours = Math.max(hours, 24);
  const since = new Date(now - collectionHours * 3_600_000).toISOString();

  function listRuns(workflow, event) {
    const runs = [];
    for (let page = 1; page <= 10; page++) {
      const body = gh([
        `repos/${repo}/actions/workflows/${workflow}/runs?event=${event}&created=>=${since}&per_page=100&page=${page}`,
      ]);
      runs.push(...body.workflow_runs);
      if (body.workflow_runs.length < 100) break;
    }
    completeness[event] = runs.length < 1000;
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
      ...(() => {
        const page = gh([
          `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
        ]);
        return {
          jobs: page.jobs,
          complete:
            Number.isInteger(page.total_count) &&
            page.total_count <= page.jobs.length,
        };
      })(),
    }));

  const query = `query($q:String!,$after:String){search(query:$q,type:ISSUE,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{...on PullRequest{number mergedAt timelineItems(itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT],last:10){totalCount nodes{...on AddedToMergeQueueEvent{createdAt}}}}}}}`;
  const mergedPrs = [];
  let after = null;
  let mergedComplete = false;
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
        queueEventsComplete:
          Number.isInteger(pr.timelineItems.totalCount) &&
          pr.timelineItems.totalCount <= pr.timelineItems.nodes.length,
      });
    }
    if (!body.pageInfo.hasNextPage) {
      mergedComplete = true;
      break;
    }
    after = body.pageInfo.endCursor;
  }

  const summary = summarize({
    prRuns,
    groupRuns,
    sampledGroupJobs,
    mergedPrs,
    now,
    windowHours: hours,
    collection: {
      status: 'collected',
      collectionId,
      prRunsComplete: completeness.pull_request,
      groupRunsComplete: completeness.merge_group,
      mergedPrsComplete: mergedComplete,
      jobsComplete: sampledGroupJobs.every(s => s.complete),
      queueEventsComplete: mergedPrs.every(p => p.queueEventsComplete),
    },
  });
  summary.repo = repo;
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hours = Number(arg('--hours', '24'));
  const summary = collect({
    gh,
    repo: process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie',
    hours,
    maxJobs: Number(arg('--max-jobs', '200')),
    collectionId: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT || '1'}`
      : null,
  });
  const out = arg('--out', 'docs/metrics/merge-queue-speed-latest.json');
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
}
