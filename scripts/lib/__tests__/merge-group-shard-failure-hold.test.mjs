import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const REPOSITORY = 'JovieInc/Jovie';
const SOURCE = 'a'.repeat(40);
const NEW_SOURCE = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const GROUP = 'd'.repeat(40);
const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/123';
const run = {
  id: 123,
  workflow_id: 178737329,
  run_attempt: 1,
  event: 'merge_group',
  status: 'completed',
  conclusion: 'failure',
  path: '.github/workflows/ci.yml',
  head_branch: `gh-readonly-queue/main/pr-42-${BASE}`,
  head_sha: GROUP,
  created_at: '2026-09-30T10:05:00Z',
  html_url: RUN_URL,
  repository: { full_name: REPOSITORY },
  head_repository: { full_name: REPOSITORY },
};
const timeline = [
  { __typename: 'PullRequestCommit', commit: { oid: SOURCE } },
  { __typename: 'AddedToMergeQueueEvent', createdAt: '2026-09-30T10:00:00Z' },
  {
    __typename: 'RemovedFromMergeQueueEvent',
    createdAt: '2026-09-30T10:10:00Z',
    reason: 'failed_checks',
  },
  { __typename: 'PullRequestCommit', commit: { oid: NEW_SOURCE } },
  { __typename: 'AddedToMergeQueueEvent', createdAt: '2026-09-30T10:20:00Z' },
];

it('CLI refuses attribution when a second failed core shard has no parsed lane evidence (Move 3 3R)', () => {
  // Drives the real collector: ciFastRemainingLog must hand the attribution
  // one {name, log} entry per failed evidence job, so core 1's parsed
  // failure can never speak for core 2's dead base fetch.
  const dir = mkdtempSync(join(tmpdir(), 'failure-hold-two-shards-'));
  try {
    const structuralLog = (passed, failed = []) =>
      [
        '======== lane: structural ========',
        `[ci-fast] structural: ${failed.length ? 'failure' : 'success'} (10.0s)`,
        ...[...passed, ...failed].map((command, index) => {
          const code = failed.includes(command) ? 'exit 1' : 'pass';
          return `| ${index + 1} | 1.0s | ${code} | \`${command}\` |`;
        }),
        ...failed.map(
          command =>
            `Structural command 1/1 failed (exit 1). Command: ${command} | tail`
        ),
      ].join('\n') + '\n';
    const command = 'pnpm doc:freshness:check';
    for (const [name, text] of [
      ['current-1.txt', structuralLog([], [command])],
      ['current-2.txt', 'fetch: waiting for the base branch\n'],
      ['ahead-1.txt', structuralLog([command])],
      ['ahead-2.txt', structuralLog(['pnpm ci:merge-queue:check'])],
    ]) {
      writeFileSync(join(dir, name), text);
    }
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({ run, timeline, source: SOURCE })
    );
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
const failed = [
  { id: 11, name: 'ci-fast (structural core 1/2)', conclusion: 'failure',
    steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] },
  { id: 12, name: 'ci-fast (structural core 2/2)', conclusion: 'failure',
    steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] },
  { id: 13, name: 'PR Ready', conclusion: 'failure',
    steps: [{ name: 'Evaluate combined-head checks', conclusion: 'failure' }] },
];
const aheadJobs = [
  { id: 21, name: 'ci-fast (structural core 1/2)', conclusion: 'success' },
  { id: 22, name: 'ci-fast (structural core 2/2)', conclusion: 'success' },
  { id: 23, name: 'PR Ready', conclusion: 'failure' },
];
const logs = {
  11: 'current-1.txt', 12: 'current-2.txt', 21: 'ahead-1.txt', 22: 'ahead-2.txt',
};
let result;
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query='));
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: fixture.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: fixture.source,
        isInMergeQueue: false, mergeQueueEntry: null, autoMergeRequest: null };
  result = { data: { repository: { pullRequest: pr } } };
}
else if (args.includes('POST')) result = {};
else if (args[1].endsWith('/logs')) {
  const id = Number(args[1].split('/actions/jobs/')[1].split('/')[0]);
  process.stdout.write(fs.readFileSync(path.join(path.dirname(process.env.HOLD_TEST_FIXTURE), logs[id]), 'utf8'));
  process.exit(0);
}
else if (args[1].includes('/compare/')) result = { status: 'behind' };
else if (args[1].includes('/actions/runs?head_sha=')) result = { workflow_runs: [
  { id: 900, workflow_id: 178737329, created_at: '2026-10-12T08:43:05Z', conclusion: 'failure' },
] };
else if (args[1].includes('/runs/900/jobs?')) result = { jobs: args[1].includes('page=1') ? aheadJobs : [] };
else if (args[1].includes('/jobs?')) result = { jobs: args[1].includes('page=1') ? failed : [] };
else if (args[1].includes('/statuses')) result = [];
else result = fixture.run;
process.stdout.write(JSON.stringify(result));
`,
      { mode: 0o755 }
    );
    const eventPath = join(dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        repository: { full_name: REPOSITORY },
        workflow_run: { id: run.id },
      })
    );
    const execution = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../merge-group-failure-hold.mjs'),
        '--event-path',
        eventPath,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          HOLD_TEST_FIXTURE: fixturePath,
          GITHUB_OUTPUT: join(dir, 'output'),
        },
      }
    );
    expect(execution.status, execution.stderr + execution.stdout).toBe(0);
    const receipt = JSON.parse(execution.stdout);
    expect(receipt.aheadAttribution).toEqual({
      attributable: false,
      reason: 'ci-fast-failure-unparsed:ci-fast (structural core 2/2)',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
