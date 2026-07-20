import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  classifyPr,
  orderPrsDependencyAware,
  summarizeChecks,
} from '../pr-conflict-handler.mjs';

function pr(overrides) {
  return {
    number: 1,
    title: 'Example PR',
    createdAt: '2026-06-01T00:00:00Z',
    baseRefName: 'main',
    headRefName: 'tim/example',
    headRepositoryOwner: { login: 'JovieInc' },
    isCrossRepository: false,
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    labels: [],
    statusCheckRollup: [],
    changedFiles: 1,
    additions: 5,
    deletions: 1,
    ...overrides,
  };
}

const greenRequired = [
  {
    __typename: 'CheckRun',
    name: 'PR Ready',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
  },
  {
    __typename: 'CheckRun',
    name: 'Migration Guard',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
  },
  { __typename: 'StatusContext', context: 'Fork PR Gate', state: 'SUCCESS' },
];

describe('PR freshness classification', () => {
  it('classifies true conflicts before CI failures so they are not generic blocked PRs', () => {
    const result = classifyPr(
      pr({
        mergeable: 'CONFLICTING',
        mergeStateStatus: 'DIRTY',
        statusCheckRollup: [
          ...greenRequired,
          { name: 'PR Ready', status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      })
    );

    expect(result.state).toBe('DIRTY');
    expect(result.reason).toContain('mergeable=CONFLICTING');
  });

  it('classifies in-flight CI as UNSTABLE and waits to avoid cancellation churn', () => {
    const result = classifyPr(
      pr({
        mergeStateStatus: 'UNSTABLE',
        statusCheckRollup: [
          ...greenRequired,
          { name: 'Typecheck', status: 'IN_PROGRESS', conclusion: null },
        ],
      })
    );

    expect(result.state).toBe('UNSTABLE');
    expect(result.reason).toContain('CI in flight');
  });

  it('classifies failing required checks as BLOCKED instead of rebasing', () => {
    const result = classifyPr(
      pr({
        mergeStateStatus: 'BLOCKED',
        statusCheckRollup: [
          { name: 'PR Ready', status: 'COMPLETED', conclusion: 'FAILURE' },
          {
            name: 'Migration Guard',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
          },
          {
            __typename: 'StatusContext',
            context: 'Fork PR Gate',
            state: 'SUCCESS',
          },
        ],
      })
    );

    expect(result.state).toBe('BLOCKED');
    expect(result.reason).toContain('PR Ready:FAILURE');
  });

  it('classifies mergeable stale branches as BEHIND for update-branch', () => {
    const result = classifyPr(
      pr({ mergeStateStatus: 'BEHIND', statusCheckRollup: greenRequired })
    );

    expect(result.state).toBe('BEHIND');
  });

  it('does not treat fork PRs as internal branches', () => {
    const result = classifyPr(
      pr({
        headRefName: 'contributor/fix',
        headRepositoryOwner: { login: 'external-user' },
        isCrossRepository: true,
        mergeStateStatus: 'BEHIND',
        statusCheckRollup: greenRequired,
      })
    );

    expect(result.internal).toBe(false);
    expect(result.reason).toContain('fork or cross-repository head');
  });
});

describe('check summarization', () => {
  it('uses the successful duplicate required context to tolerate cancelled zombie checks', () => {
    const result = summarizeChecks([
      {
        name: 'PR Ready',
        status: 'COMPLETED',
        conclusion: 'CANCELLED',
        completedAt: '2026-06-01T00:05:00Z',
      },
      {
        name: 'PR Ready',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        completedAt: '2026-06-01T00:04:00Z',
      },
      {
        name: 'Migration Guard',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      },
      {
        __typename: 'StatusContext',
        context: 'Fork PR Gate',
        state: 'SUCCESS',
      },
    ]);

    expect(
      result.required.find(check => check.name === 'CI / PR Ready').state
    ).toBe('SUCCESS');
  });
});

describe('dependency-aware ordering and Neon capacity', () => {
  it('orders smaller/older roots first and children after their base PR', () => {
    const parent = pr({
      number: 10,
      headRefName: 'tim/parent',
      baseRefName: 'main',
      createdAt: '2026-06-02T00:00:00Z',
      changedFiles: 5,
    });
    const child = pr({
      number: 11,
      headRefName: 'tim/child',
      baseRefName: 'tim/parent',
      createdAt: '2026-06-01T00:00:00Z',
      changedFiles: 1,
    });
    const smallRoot = pr({
      number: 9,
      headRefName: 'tim/small-root',
      baseRefName: 'main',
      createdAt: '2026-06-03T00:00:00Z',
      changedFiles: 1,
    });

    expect(
      orderPrsDependencyAware([child, parent, smallRoot]).map(
        item => item.number
      )
    ).toEqual([9, 10, 11]);
  });

  it('caps CI-heavy re-triggers by subtracting in-flight CI from max concurrency', () => {
    const plan = buildPlan(
      [
        pr({
          number: 1,
          mergeStateStatus: 'UNSTABLE',
          statusCheckRollup: [{ name: 'Typecheck', status: 'IN_PROGRESS' }],
        }),
        pr({
          number: 2,
          mergeStateStatus: 'BEHIND',
          statusCheckRollup: greenRequired,
        }),
        pr({
          number: 3,
          mergeStateStatus: 'BEHIND',
          statusCheckRollup: greenRequired,
        }),
      ],
      { maxConcurrent: 2 }
    );

    expect(plan.capacity.currentCiInFlight).toBe(1);
    expect(plan.items.find(item => item.number === 2).action).toBe(
      'request_github_rebase'
    );
    expect(plan.items.find(item => item.number === 3).action).toBe(
      'wait_capacity'
    );
  });

  it('skips update-branch for forks even when they are behind', () => {
    const plan = buildPlan([
      pr({
        number: 4,
        mergeStateStatus: 'BEHIND',
        headRepositoryOwner: { login: 'someone-else' },
        isCrossRepository: true,
        statusCheckRollup: greenRequired,
      }),
    ]);

    expect(plan.items[0].action).toBe('skip_fork');
  });
});

describe('conflict mutation policy', () => {
  it('labels true conflicts without merging or force-pushing the PR branch', () => {
    const plan = buildPlan([
      pr({
        mergeable: 'CONFLICTING',
        mergeStateStatus: 'DIRTY',
        statusCheckRollup: greenRequired,
      }),
    ]);

    expect(plan.items[0]).toMatchObject({
      action: 'label_needs_manual_rebase',
      triggersCi: false,
    });
  });
});
