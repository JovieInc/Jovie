import { describe, expect, it, vi } from 'vitest';
import {
  applyMergeGroupFailure,
  classifyMergeGroupFailure,
  FAILURE_HOLD_CONTEXT,
  parseMergeQueueBranch,
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
