import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyMergeGroupFailure,
  classifyMergeGroupFailure,
  PR_SIZE_GUARD_WORKFLOW_ID,
  shouldHoldMergeGroupRun,
} from '../../merge-group-failure-hold.mjs';
import {
  failedRequiredMergeGroupJobs,
  MERGE_GROUP_REQUIRED_LANES,
} from '../merge-group-required-lanes.mjs';
import { MERGE_GROUP_FAILURE_CONCLUSIONS } from '../merge-queue-guard.mjs';

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
const classify = (conclusion, failedSteps = []) =>
  classifyMergeGroupFailure({ conclusion, failedSteps });
const failureInput = {
  repository: REPOSITORY,
  run,
  timeline,
  failedSteps: ['Run structural ci-fast lane'],
  statuses: [],
};

describe('cancel-after-required-lane-failure (JOV-13106)', () => {
  const redJob = (name = 'ci-fast', step = 'Run structural ci-fast lane') => ({
    name,
    status: 'completed',
    conclusion: 'failure',
    steps: [{ name: step, conclusion: 'failure' }],
  });
  const cancelled = { ...run, conclusion: 'cancelled' };

  it('keeps plain cancellation out of the generic failure/retry conclusion set', () => {
    expect([...MERGE_GROUP_FAILURE_CONCLUSIONS]).toEqual([
      'failure',
      'timed_out',
      'action_required',
      'startup_failure',
      'stale',
    ]);
    expect(() => classify('cancelled')).toThrow(
      /unsupported terminal conclusion/
    );
    for (const conclusion of MERGE_GROUP_FAILURE_CONCLUSIONS) {
      expect(shouldHoldMergeGroupRun({ ...run, conclusion })).toBe(true);
    }
    expect(
      shouldHoldMergeGroupRun({ ...run, conclusion: 'success' }, [redJob()])
    ).toBe(false);
  });

  it('recognizes every pinned required lane, including matrix shard REST names', () => {
    for (const template of Object.values(MERGE_GROUP_REQUIRED_LANES)) {
      const name = template.replace('${{ matrix.shard }}', '1/14');
      expect(shouldHoldMergeGroupRun(cancelled, [redJob(name)]), name).toBe(
        true
      );
      expect(
        shouldHoldMergeGroupRun(cancelled, [redJob(`${name} optional`)])
      ).toBe(false);
    }
    expect(
      failedRequiredMergeGroupJobs([redJob('Unit Tests (packages/ui)')])
    ).toHaveLength(1);
    expect(
      failedRequiredMergeGroupJobs([
        redJob('Storybook Surface Matrix (combined) (1)'),
        redJob('Storybook Surface Matrix (combined) (certification)'),
      ])
    ).toHaveLength(2);
    expect(
      shouldHoldMergeGroupRun(
        { ...cancelled, workflow_id: PR_SIZE_GUARD_WORKFLOW_ID },
        [redJob()]
      )
    ).toBe(false);
  });

  it.each(
    [
      [],
      [redJob('PR Ready')],
      [redJob('Merge Group Fail Fast (ci-fast)')],
      [{ ...redJob(), status: 'in_progress' }],
      [{ ...redJob(), conclusion: 'cancelled' }],
      [{ ...redJob(), conclusion: 'success' }],
      [{ ...redJob(), conclusion: 'skipped' }],
    ].map(jobs => ({ jobs }))
  )(
    'skips supersession and unrelated failures without reads or writes: $jobs',
    async ({ jobs }) => {
      expect(shouldHoldMergeGroupRun(cancelled, jobs)).toBe(false);
      const effects = {
        writeStatus: vi.fn(),
        readPullRequest: vi.fn(),
        dequeuePullRequest: vi.fn(),
        disableAutoMerge: vi.fn(),
      };
      const result = await applyMergeGroupFailure(
        { ...failureInput, run: cancelled, jobs, timeline: [] },
        effects
      );
      expect(result).toMatchObject({
        skipped: true,
        reason: 'cancelled-without-required-lane-failure',
      });
      for (const effect of Object.values(effects))
        expect(effect).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['ci-fast', 'Run structural ci-fast lane', 'deterministic-source'],
    ['Unit Tests (3/14)', 'Run unit tests', 'retryable-product'],
    ['Mac Build + Test (combined)', 'Set up job', 'transient-infrastructure'],
  ])(
    'classifies cancelled %s using only its completed required failure',
    async (name, step, classification) => {
      const effects = {
        writeStatus: vi.fn(),
        dequeuePullRequest: vi.fn(),
        disableAutoMerge: vi.fn(),
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          autoMergeRequest: null,
        })),
      };
      const result = await applyMergeGroupFailure(
        {
          ...failureInput,
          run: cancelled,
          // A supplied unrelated deterministic step cannot taint a cancelled job.
          failedSteps: ['Run structural ci-fast lane'],
          jobs: [redJob(name, step), redJob('Optional audit')],
        },
        effects
      );
      expect(result).toMatchObject({ classification, statusWritten: true });
      expect(effects.writeStatus).toHaveBeenCalled();
    }
  );

  it.each([
    ['failure', [], true],
    ['cancelled', [redJob('Unit Tests (packages/ui)')], true],
    ['cancelled', [redJob('Optional audit')], false],
    ['cancelled', [], false],
  ])(
    'pre-token CLI inspects %s with paginated, attempt-bound read-only requests',
    (conclusion, jobs, shouldHold) => {
      const dir = mkdtempSync(join(tmpdir(), 'failure-hold-precheck-'));
      try {
        const input = join(dir, 'fixture.json');
        writeFileSync(
          input,
          JSON.stringify({ run: { ...run, conclusion }, jobs })
        );
        const eventPath = join(dir, 'event.json');
        writeFileSync(
          eventPath,
          JSON.stringify({
            repository: { full_name: REPOSITORY },
            workflow_run: { ...run, conclusion },
          })
        );
        writeFileSync(
          join(dir, 'gh'),
          `#!${process.execPath}
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
const endpoint = args[2];
if (args[0] !== 'api' || args[1] !== '--include' || args.length !== 3) throw new Error('precheck attempted a write');
if (endpoint === 'repos/JovieInc/Jovie/actions/runs/123') {
  process.stdout.write(JSON.stringify(fixture.run));
} else if (endpoint === 'repos/JovieInc/Jovie/actions/runs/123/attempts/1/jobs?per_page=100&page=1') {
  process.stdout.write(JSON.stringify({ jobs: Array.from({length:100}, () => ({ name: 'Optional audit', status: 'completed', conclusion: 'success' })) }));
} else if (endpoint === 'repos/JovieInc/Jovie/actions/runs/123/attempts/1/jobs?per_page=100&page=2') {
  process.stdout.write(JSON.stringify({ jobs: fixture.jobs }));
} else { throw new Error('unexpected precheck request: ' + endpoint); }
`,
          { mode: 0o755 }
        );
        const outputPath = join(dir, 'output');
        const execution = spawnSync(
          process.execPath,
          [
            resolve(
              import.meta.dirname,
              '../../merge-group-failure-evidence.mjs'
            ),
            '--event-path',
            eventPath,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${dir}:${process.env.PATH}`,
              HOLD_TEST_FIXTURE: input,
              GITHUB_OUTPUT: outputPath,
              JOVIE_API_STATE_DIR: dir,
            },
            timeout: 60_000,
          }
        );
        expect(execution.status, execution.stderr).toBe(0);
        expect(JSON.parse(execution.stdout)).toMatchObject({ shouldHold });
        expect(readFileSync(outputPath, 'utf8')).toBe(
          `should_hold=${shouldHold}\n`
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});
