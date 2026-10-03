import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyMergeGroupFailure,
  classifyDequeueDenial,
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
const classify = (conclusion, failedSteps = []) =>
  classifyMergeGroupFailure({ conclusion, failedSteps });
const disposition = statuses =>
  revisionFailureDisposition({ repository: REPOSITORY, statuses });
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
  expect(disposition([trusted]).action).toBe('block');
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

const failureInput = {
  repository: REPOSITORY,
  run,
  timeline,
  failedSteps: ['Run structural ci-fast lane'],
  statuses: [],
};

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
    expect(disposition([trusted]).action).toBe('block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('completes the hold CLI when gh denies dequeuePullRequest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-hold-deny-'));
  try {
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({ run, timeline, source: SOURCE })
    );
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const args = process.argv.slice(2);
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query=')) || '';
  if (query.includes('dequeuePullRequest')) {
    process.stderr.write('gh: Resource not accessible by integration\\n');
    process.exit(1);
  }
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: fixture.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: fixture.source,
        isInMergeQueue: true, mergeQueueEntry: { id: 'MQE_42' }, autoMergeRequest: null };
  process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: pr } } }));
} else if (args.includes('POST')) {
  process.stdout.write('{}');
} else if (args[1].includes('/jobs?')) {
  process.stdout.write(JSON.stringify({ jobs: [
    { steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] }
  ] }));
} else if (args[1].includes('/statuses')) {
  process.stdout.write('[]');
} else {
  process.stdout.write(JSON.stringify(fixture.run));
}
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
    expect(execution.stderr).toContain(
      'Resource not accessible by integration'
    );
    const receipt = JSON.parse(execution.stdout);
    expect(receipt).toMatchObject({
      statusWritten: true,
      dequeued: false,
      dequeueOutcome: 'inaccessible',
      autoMergeDisabled: false,
    });
    expect(readFileSync(outputPath, 'utf8')).toBe(
      `failure_receipt=${JSON.stringify(receipt)}\n`
    );
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
          ...failureInput,
          run: { ...run, workflow_id: 1 },
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
    expect(classify('failure', ['Run structural ci-fast lane'])).toBe(
      'deterministic-source'
    );
    expect(classify('failure', ['Run unit tests'])).toBe('retryable-product');
    expect(classify('startup_failure')).toBe('transient-infrastructure');
  });

  it('classifies an over-cap base separately from a PR that grew the capped file', () => {
    const step = ['Evaluate repository instruction contracts'];
    const text = 'CLAUDE.md: 6081 bytes exceeds 6000';
    expect(classify('failure', step)).toBe('unclassified');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: step,
        annotationText: text,
        changedFiles: ['apps/web/page.tsx'],
      })
    ).toBe('base-branch');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: step,
        annotationText: text,
        changedFiles: ['CLAUDE.md'],
      })
    ).toBe('deterministic-source');
  });

  it('requeues a base-branch hold only after main moves', () => {
    const recorded = 'e'.repeat(40);
    const moved = 'f'.repeat(40);
    const baseHold = status({
      description: `class=base-branch;n=2;run=123;try=1;main=${recorded}`,
    });
    expect(disposition([baseHold])).toMatchObject({
      action: 'block',
      reason: 'base-branch-failure',
    });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [baseHold],
        currentMainSha: recorded,
      })
    ).toMatchObject({ action: 'block', reason: 'base-branch-failure' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [baseHold],
        currentMainSha: moved,
      })
    ).toMatchObject({ action: 'retry-once', reason: 'base-branch-resolved' });
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
    expect(disposition([released, spent, first])).toMatchObject({
      action: 'retry-once',
    });
    expect(disposition([spent, released, first])).toMatchObject({
      action: 'block',
    });
    expect(
      disposition([
        { ...released, creator: { login: 'random', type: 'Bot' } },
        spent,
        first,
      ])
    ).toMatchObject({ action: 'block' });
    expect(
      disposition([
        released,
        spent,
        status({ classification: 'deterministic-source' }),
      ])
    ).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(
      disposition([
        released,
        spent,
        status({ classification: 'transient-infrastructure', number: 2 }),
      ])
    ).toMatchObject({ action: 'block', reason: 'revision-retry-exhausted' });
  });

  it('blocks the unchanged deterministic head while a new head has no hold', () => {
    expect(disposition([status()])).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(disposition([])).toMatchObject({ action: 'allow' });
  });

  it('allows one non-deterministic retry, then blocks the same revision', () => {
    const first = status({ classification: 'transient-infrastructure' });
    expect(disposition([first])).toMatchObject({ action: 'retry-once' });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: retrySpentDescription({ runId: 123, runAttempt: 1 }),
    });
    expect(disposition([first, spent])).toMatchObject({
      action: 'block',
      reason: 'revision-retry-spent',
    });
    expect(
      disposition([
        first,
        status({
          classification: 'transient-infrastructure',
          number: 2,
          runId: 124,
        }),
      ])
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
    const result = await applyMergeGroupFailure(failureInput, {
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
    });

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

  it('records a base-branch hold that can requeue after main moves', async () => {
    const main = 'e'.repeat(40);
    const writeStatus = vi.fn();
    const result = await applyMergeGroupFailure(
      {
        ...failureInput,
        failedSteps: ['Evaluate repository instruction contracts'],
        annotationText: 'CLAUDE.md: 6081 bytes exceeds 6000',
        changedFiles: ['README.md'],
        mainSha: main,
      },
      {
        writeStatus,
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          autoMergeRequest: null,
        })),
        dequeuePullRequest: vi.fn(),
        disableAutoMerge: vi.fn(),
      }
    );
    expect(result).toMatchObject({
      classification: 'base-branch',
      retryDisposition: 'requeue-after-base-moves',
      mainSha: main,
    });
    expect(writeStatus.mock.calls[0][0].description).toBe(
      `class=base-branch;n=1;run=123;try=1;main=${main}`
    );
  });

  it('records the old revision but never mutates an already-new source head', async () => {
    const dequeuePullRequest = vi.fn();
    const disableAutoMerge = vi.fn();
    const result = await applyMergeGroupFailure(failureInput, {
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
    });

    expect(result).toMatchObject({
      sourceHeadSha: SOURCE,
      currentHeadSha: NEW_SOURCE,
      exactHeadStillCurrent: false,
    });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(disableAutoMerge).not.toHaveBeenCalled();
  });

  it('classifies only the integration denial and an already-removed queue', () => {
    const denied = Object.assign(new Error('Command failed: gh api graphql'), {
      stderr: 'gh: Resource not accessible by integration\n',
    });
    expect(classifyDequeueDenial(denied)).toBe('inaccessible');
    expect(
      classifyDequeueDenial(
        new Error('The pull request is not in the merge queue')
      )
    ).toBe('not-in-queue');
    expect(classifyDequeueDenial(new Error('not in queue'))).toBe(
      'not-in-queue'
    );
    expect(classifyDequeueDenial(new Error('HTTP 502'))).toBeNull();
    expect(classifyDequeueDenial(new Error('socket hang up'))).toBeNull();
  });

  it('persists the hold when dequeue is denied and still disables auto-merge', async () => {
    let state = {
      id: 'PR_42',
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42' },
      autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
    };
    const order = [];
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(async () => {
        order.push('status');
      }),
      readPullRequest: vi.fn(async () => structuredClone(state)),
      dequeuePullRequest: vi.fn(async () => {
        order.push('dequeue');
        const error = Object.assign(
          new Error('Command failed: gh api graphql'),
          { stderr: 'gh: Resource not accessible by integration\n' }
        );
        throw error;
      }),
      disableAutoMerge: vi.fn(async () => {
        order.push('disable');
        state = { ...state, autoMergeRequest: null };
      }),
    });

    expect(order).toEqual(['status', 'dequeue', 'disable']);
    expect(result).toMatchObject({
      statusWritten: true,
      dequeued: false,
      dequeueOutcome: 'inaccessible',
      autoMergeDisabled: true,
      exactHeadStillCurrent: true,
    });
  });

  it('treats an already-removed pull request as a logged non-fatal dequeue', async () => {
    let reads = 0;
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(),
      readPullRequest: vi.fn(async () => {
        reads += 1;
        const queued = reads < 3;
        return {
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: queued,
          mergeQueueEntry: queued ? { id: 'MQE_42' } : null,
          autoMergeRequest: null,
        };
      }),
      dequeuePullRequest: vi.fn(async () => {
        throw new Error('The pull request is not in the merge queue');
      }),
      disableAutoMerge: vi.fn(),
    });

    expect(result).toMatchObject({
      dequeued: false,
      dequeueOutcome: 'not-in-queue',
      autoMergeDisabled: false,
    });
  });

  it('still fails the hold when dequeue hits a genuine error', async () => {
    const writeStatus = vi.fn();
    await expect(
      applyMergeGroupFailure(failureInput, {
        writeStatus,
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: true,
          mergeQueueEntry: { id: 'MQE_42' },
          autoMergeRequest: null,
        })),
        dequeuePullRequest: vi.fn(async () => {
          throw new Error('HTTP 502');
        }),
        disableAutoMerge: vi.fn(),
      })
    ).rejects.toThrow(/HTTP 502/);
    expect(writeStatus).toHaveBeenCalledOnce();
  });

  it('still fails when auto-merge remains after a denied dequeue', async () => {
    await expect(
      applyMergeGroupFailure(failureInput, {
        writeStatus: vi.fn(),
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: true,
          mergeQueueEntry: { id: 'MQE_42' },
          autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
        })),
        dequeuePullRequest: vi.fn(async () => {
          throw new Error('gh: Resource not accessible by integration');
        }),
        disableAutoMerge: vi.fn(),
      })
    ).rejects.toThrow(/native queue intent/);
  });
});
