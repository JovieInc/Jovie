import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  applyMergeGroupFailure,
  classifyMergeGroupFailure,
  enqueueWasRejected,
  FAILURE_HOLD_CONTEXT,
  failureReceiptStatus,
  parseMergeQueueBranch,
  retryReleasedDescription,
  retrySpentDescription,
  revisionFailureDisposition,
  sourceHeadForRun,
} from '../../merge-group-failure-hold.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const SOURCE = 'a'.repeat(40);
const NEW_SOURCE = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const GROUP = 'd'.repeat(40);
const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/123';
it('validates trusted failure receipts and never applies them to a different revision', () => {
  const receipt = {
    schema: 'jovie-merge-group-failure-hold/v1',
    repository: REPOSITORY,
    prNumber: 42,
    sourceHeadSha: SOURCE,
    classification: 'deterministic-source',
    failureNumber: 1,
    workflowRunId: 123,
    workflowRunAttempt: 1,
  };
  const scope = { repository: REPOSITORY, prNumber: 42, headSha: SOURCE };
  const convert = value => failureReceiptStatus(JSON.stringify(value), scope);
  const trusted = convert(receipt);
  expect(
    revisionFailureDisposition({ statuses: [trusted], repository: REPOSITORY })
      .action
  ).toBe('block');
  expect(trusted.target_url).toBe(RUN_URL);
  expect(failureReceiptStatus('', scope)).toBeNull();
  expect(failureReceiptStatus(undefined, scope)).toBeNull();
  expect(convert({ ...receipt, prNumber: 43 })).toBeNull();
  expect(convert({ ...receipt, sourceHeadSha: NEW_SOURCE })).toBeNull();
  for (const invalid of [
    null,
    {},
    { ...receipt, schema: 'spoof' },
    { ...receipt, repository: 'other/repo' },
    { ...receipt, sourceHeadSha: 'bad' },
    { ...receipt, classification: 'unknown' },
    { ...receipt, prNumber: -1 },
    { ...receipt, failureNumber: 0 },
    { ...receipt, workflowRunId: 0 },
    { ...receipt, workflowRunAttempt: 0 },
  ]) {
    expect(() => convert(invalid)).toThrow();
  }
  expect(() => failureReceiptStatus(null, scope)).toThrow();
  expect(() => failureReceiptStatus('{', scope)).toThrow();
});
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

it('passes the actual failure-hold CLI receipt to enrollment without a replicated status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-hold-cli-'));
  try {
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({ run, timeline, source: SOURCE })
    );
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
let result;
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query='));
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: fixture.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: fixture.source,
        isInMergeQueue: false, mergeQueueEntry: null, autoMergeRequest: null };
  result = { data: { repository: { pullRequest: pr } } };
} else if (args.includes('POST')) result = {};
else if (args[1].includes('/jobs?')) result = { jobs: [
  { steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] }
] };
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
    const outputPath = join(dir, 'output');
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
          GITHUB_OUTPUT: outputPath,
        },
      }
    );
    expect(execution.status, execution.stderr).toBe(0);
    const receipt = JSON.parse(execution.stdout);
    expect(receipt.statusWritten).toBe(true);
    const output = readFileSync(outputPath, 'utf8');
    expect(output).toBe(`failure_receipt=${JSON.stringify(receipt)}\n`);
    const trusted = failureReceiptStatus(
      output.trim().slice('failure_receipt='.length),
      {
        repository: REPOSITORY,
        prNumber: 42,
        headSha: SOURCE,
      }
    );
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [trusted],
      }).action
    ).toBe('block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const status = ({
  classification = 'deterministic-source',
  number = 1,
  runId = 123,
  attempt = 1,
  context = FAILURE_HOLD_CONTEXT,
  description = `class=${classification};n=${number};run=${runId};try=${attempt}`,
} = {}) => ({
  context,
  state: 'success',
  description,
  creator: { type: 'Bot', login: 'jovie-bot[bot]' },
  target_url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`,
});

describe('merge-group source revision mapping', () => {
  it('maps the exact front PR and source head even after a later push', () => {
    expect(parseMergeQueueBranch(run.head_branch)).toEqual({
      prNumber: 42,
      baseSha: BASE,
    });
    expect(sourceHeadForRun(timeline, run.created_at)).toBe(SOURCE);
    expect(sourceHeadForRun(timeline, '2026-09-30T10:25:00Z')).toBe(NEW_SOURCE);
  });

  it('fails closed when no admitted source revision is provable', () => {
    expect(() => sourceHeadForRun([], run.created_at)).toThrow(
      /no queue admission/
    );
    expect(parseMergeQueueBranch('gh-readonly-queue/main/pr-42-short')).toBe(
      null
    );
  });

  it('rejects a similarly shaped run from any workflow other than CI', async () => {
    await expect(
      applyMergeGroupFailure(
        {
          repository: REPOSITORY,
          run: { ...run, workflow_id: 1 },
          timeline,
          failedSteps: ['Run structural ci-fast lane'],
          statuses: [],
        },
        {
          writeStatus: vi.fn(),
          readPullRequest: vi.fn(),
          dequeuePullRequest: vi.fn(),
          disableAutoMerge: vi.fn(),
        }
      )
    ).rejects.toThrow(/terminal merge-group CI failure/);
  });
});

describe('failure classification and revision-scoped suppression', () => {
  it('classifies deterministic source checks separately from infrastructure', () => {
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: ['Run structural ci-fast lane'],
      })
    ).toBe('deterministic-source');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: ['Run unit tests'],
      })
    ).toBe('retryable-product');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'startup_failure',
        failedSteps: [],
      })
    ).toBe('transient-infrastructure');
  });

  it('releases only an explicitly rejected enqueue, preserving ambiguous outcomes', () => {
    const rejected = {
      data: { enqueuePullRequest: null },
      errors: [{ type: 'UNPROCESSABLE', path: ['enqueuePullRequest'] }],
    };
    expect(enqueueWasRejected(rejected)).toBe(true);
    for (const error of [
      new Error('socket timeout'),
      {},
      {
        ...rejected,
        data: { enqueuePullRequest: { mergeQueueEntry: { position: 1 } } },
      },
      {
        ...rejected,
        errors: [{ type: 'INTERNAL', path: ['enqueuePullRequest'] }],
      },
      {
        ...rejected,
        errors: [{ type: 'UNPROCESSABLE', path: ['anotherMutation'] }],
      },
      { ...rejected, errors: [] },
    ])
      expect(enqueueWasRejected(error)).toBe(false);
  });

  it('newest trusted release restores the unused retry; a later reservation blocks it', () => {
    const first = status({ classification: 'transient-infrastructure' });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: retrySpentDescription({ runId: 123, runAttempt: 1 }),
    });
    const released = {
      ...spent,
      description: retryReleasedDescription({ runId: 123, runAttempt: 1 }),
    };
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [released, spent, first],
      })
    ).toMatchObject({ action: 'retry-once' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [spent, released, first],
      })
    ).toMatchObject({ action: 'block' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [
          { ...released, creator: { login: 'random', type: 'Bot' } },
          spent,
          first,
        ],
      })
    ).toMatchObject({ action: 'block' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [
          released,
          spent,
          status({ classification: 'deterministic-source' }),
        ],
      })
    ).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [
          released,
          spent,
          status({ classification: 'transient-infrastructure', number: 2 }),
        ],
      })
    ).toMatchObject({ action: 'block', reason: 'revision-retry-exhausted' });
  });

  it('blocks the unchanged deterministic head while a new head has no hold', () => {
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [status()],
      })
    ).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(
      revisionFailureDisposition({ repository: REPOSITORY, statuses: [] })
    ).toMatchObject({ action: 'allow' });
  });

  it('allows one non-deterministic retry, then blocks the same revision', () => {
    const first = status({ classification: 'transient-infrastructure' });
    expect(
      revisionFailureDisposition({ repository: REPOSITORY, statuses: [first] })
    ).toMatchObject({ action: 'retry-once' });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: retrySpentDescription({ runId: 123, runAttempt: 1 }),
    });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [first, spent],
      })
    ).toMatchObject({ action: 'block', reason: 'revision-retry-spent' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [
          first,
          status({
            classification: 'transient-infrastructure',
            number: 2,
            runId: 124,
          }),
        ],
      })
    ).toMatchObject({ action: 'block', reason: 'revision-retry-exhausted' });
  });
});

describe('terminal failure hold application', () => {
  it('persists before dequeueing and disabling the exact unchanged head', async () => {
    let state = {
      id: 'PR_42',
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42' },
      autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
    };
    const order = [];
    const writeStatus = vi.fn(async receipt => {
      order.push('status');
      expect(receipt.sha).toBe(SOURCE);
      expect(receipt.description).toContain('class=deterministic-source');
    });
    const result = await applyMergeGroupFailure(
      {
        repository: REPOSITORY,
        run,
        timeline,
        failedSteps: ['Run structural ci-fast lane'],
        statuses: [],
      },
      {
        writeStatus,
        readPullRequest: vi.fn(async () => structuredClone(state)),
        dequeuePullRequest: vi.fn(async () => {
          order.push('dequeue');
          state = { ...state, isInMergeQueue: false, mergeQueueEntry: null };
        }),
        disableAutoMerge: vi.fn(async () => {
          order.push('disable');
          state = { ...state, autoMergeRequest: null };
        }),
      }
    );

    expect(order).toEqual(['status', 'dequeue', 'disable']);
    expect(result).toMatchObject({
      prNumber: 42,
      sourceHeadSha: SOURCE,
      classification: 'deterministic-source',
      retryDisposition: 'blocked-until-new-source-head',
      dequeued: true,
      autoMergeDisabled: true,
    });
  });

  it('records the old revision but never mutates an already-new source head', async () => {
    const dequeuePullRequest = vi.fn();
    const disableAutoMerge = vi.fn();
    const result = await applyMergeGroupFailure(
      {
        repository: REPOSITORY,
        run,
        timeline,
        failedSteps: ['Run structural ci-fast lane'],
        statuses: [],
      },
      {
        writeStatus: vi.fn(),
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: NEW_SOURCE,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          autoMergeRequest: { enabledAt: '2026-09-30T10:30:00Z' },
        })),
        dequeuePullRequest,
        disableAutoMerge,
      }
    );

    expect(result).toMatchObject({
      sourceHeadSha: SOURCE,
      currentHeadSha: NEW_SOURCE,
      exactHeadStillCurrent: false,
    });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(disableAutoMerge).not.toHaveBeenCalled();
  });
});
