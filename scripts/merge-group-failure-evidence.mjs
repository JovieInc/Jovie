#!/usr/bin/env node
// Read-only pre-token gate. Do not import the failure-hold writer here:
// this entry point executes with GITHUB_TOKEN and can only inspect jobs.
import { appendFileSync, readFileSync } from 'node:fs';
import { runGh } from '../packages/api-client/gh.ts';
import { shouldHoldMergeGroupRun } from './lib/merge-group-required-lanes.mjs';

// api-budget: github-actions-token 30/hr - planning allowance for cancelled-run job reads; actual frequency is unknown. At most 30 pages per run; no reads for existing failure conclusions.

const [flag, eventPath, ...extra] = process.argv.slice(2);
if (flag !== '--event-path' || !eventPath || extra.length) {
  throw new Error(
    'usage: merge-group-failure-evidence.mjs --event-path <workflow-run-event>'
  );
}
const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const repository = event.repository?.full_name;
const run = event.workflow_run;
if (
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '') ||
  run?.event !== 'merge_group' ||
  run.status !== 'completed' ||
  run.head_repository?.full_name !== repository ||
  !Number.isSafeInteger(run.id) ||
  run.id < 1 ||
  !Number.isSafeInteger(run.run_attempt) ||
  run.run_attempt < 1
) {
  throw new Error(
    'terminal same-repository merge-group run identity is incomplete'
  );
}
const jobs = [];
if (run.conclusion === 'cancelled') {
  for (let page = 1; ; page += 1) {
    if (page > 30) throw new Error('jobs pagination exceeded safety limit');
    const result = await runGh(
      [
        'api',
        `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
      ],
      { priority: 'merge', maxAttempts: 1, maxWaitMs: 0 }
    );
    // Quota/transport deferral mints no token and writes no should_hold output.
    if (result.code !== 0) {
      process.stderr.write(`${result.stderr}\n`);
      process.exit(result.code);
    }
    const response = JSON.parse(result.stdout);
    if (!Array.isArray(response.jobs))
      throw new Error('malformed jobs response');
    jobs.push(...response.jobs);
    if (response.jobs.length < 100) break;
  }
}
const shouldHold = shouldHoldMergeGroupRun(run, jobs);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `should_hold=${shouldHold}\n`);
process.stdout.write(
  `${JSON.stringify({ shouldHold, workflowRunId: run.id })}\n`
);
