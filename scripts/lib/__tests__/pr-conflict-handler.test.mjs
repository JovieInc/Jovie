import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildConflictFxCohortMarker,
  buildConflictFxPrompt,
  buildConflictFxStatusDescription,
  buildPlan,
  buildSteeringExceptionReceipt,
  CONFLICT_CLOSED_LOOP_INVARIANT_ID,
  CONFLICT_FX_CLAIM_TTL_MS,
  CONFLICT_FX_COHORT_SCHEMA,
  CONFLICT_FX_MAX_ATTEMPTS,
  CONFLICT_FX_MODEL,
  CONFLICT_FX_RECEIPT_SCHEMA,
  CONFLICT_FX_STATUS_CONTEXT,
  CONFLICT_STEERING_EXCEPTION_SCHEMA,
  classifyPr,
  computeAdaptiveConcurrency,
  orderPrsDependencyAware,
  parseConflictFxCohortComments,
  parseConflictFxReceipt,
  summarizeChecks,
} from '../pr-conflict-handler.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const OTHER_BASE_WITH_SAME_PREFIX = `${BASE.slice(0, 12)}${'c'.repeat(28)}`;
const TRUSTED_APP_LOGIN = 'jovie-bot[bot]';
const NOW = Date.parse('2026-08-30T18:00:00Z');
const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/pr-conflict-handler.yml'
  ),
  'utf8'
);

function workflowStep(name) {
  const marker = `      - name: ${name}\n`;
  const start = WORKFLOW.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const remainder = WORKFLOW.slice(start + marker.length);
  return `${marker}${remainder.split('\n      - name:', 1)[0]}`;
}

function workflowRunBodies() {
  const bodies = [];
  const lines = WORKFLOW.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^ {8}run: \|$/u.test(lines[index])) continue;
    const body = [];
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index] !== '' && !lines[index].startsWith('          ')) {
        index -= 1;
        break;
      }
      body.push(lines[index]);
    }
    bodies.push(body.join('\n'));
  }
  return bodies;
}

function pr(overrides) {
  return {
    number: 1,
    title: 'Example PR',
    createdAt: '2026-06-01T00:00:00Z',
    baseRefName: 'main',
    baseRefOid: BASE,
    headRefName: 'tim/example',
    headRefOid: HEAD,
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

/**
 * @param {{
 *   baseOid?: string,
 *   baseRefName?: string,
 *   cap?: number,
 *   attempt?: number,
 *   maxAttempts?: number,
 *   outcome?: string,
 *   cohortId?: string,
 *   createdAt?: string,
 *   creator?: {login: string, type: string},
 *   typename?: string,
 *   targetUrl?: string,
 * }} [options]
 */
function conflictStatus({
  baseOid = BASE,
  baseRefName = 'main',
  cap = 2,
  attempt = 1,
  maxAttempts = CONFLICT_FX_MAX_ATTEMPTS,
  outcome = 'pending',
  cohortId = 'cohort-2-a',
  createdAt = '2026-08-30T17:55:00Z',
  creator = { login: TRUSTED_APP_LOGIN, type: 'Bot' },
  typename = 'StatusContext',
  targetUrl,
} = {}) {
  return {
    __typename: typename,
    context: CONFLICT_FX_STATUS_CONTEXT,
    state:
      outcome === 'pending'
        ? 'PENDING'
        : outcome === 'success'
          ? 'SUCCESS'
          : 'FAILURE',
    description: buildConflictFxStatusDescription({
      cohortId,
      cap,
      attempt,
      maxAttempts,
      outcome,
      baseOid,
    }),
    targetUrl:
      targetUrl ??
      `https://github.com/JovieInc/Jovie/actions/runs/123456789?base_ref=${encodeURIComponent(baseRefName)}`,
    createdAt,
    creator,
  };
}

function cohort(overrides = {}) {
  return {
    id: 'cohort-10-a',
    cap: 10,
    attempted: 10,
    successes: 10,
    failures: 0,
    pending: 0,
    staleHeadSkips: 0,
    staleHeadSkipRate: 0,
    p95CiLatencyMs: 300_000,
    baselineP95CiLatencyMs: 300_000,
    runnerCapacity: 120,
    activeCi: 0,
    queuedCi: 0,
    backlog: 80,
    clean: true,
    createdAt: '2026-08-30T17:00:00Z',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
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

  it('shares one adaptive capacity budget across clean rebases and conflict FX', () => {
    const plan = buildPlan(
      [
        pr({
          number: 1,
          mergeStateStatus: 'BEHIND',
          statusCheckRollup: greenRequired,
        }),
        pr({
          number: 2,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: greenRequired,
        }),
        pr({
          number: 3,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: greenRequired,
        }),
      ],
      { maxConcurrent: 40, runnerCapacity: 120 }
    );

    expect(plan.capacity.availableCiSlots).toBe(2);
    expect(plan.capacity.plannedCiTriggers).toBe(2);
    expect(plan.items.map(item => item.action)).toEqual([
      'request_github_rebase',
      'escalate_conflict_fx',
      'wait_capacity',
    ]);
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
  it('never mutates a PR already owned by the native merge queue', () => {
    const plan = buildPlan(
      [
        pr({
          isInMergeQueue: true,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
        }),
      ],
      { now: NOW, runnerCapacity: 120, maxConcurrent: 40 }
    );
    expect(plan.items[0]).toMatchObject({
      action: 'skip_native_merge_queue',
      triggersCi: false,
    });
    expect(plan.fxMatrix).toEqual([]);
  });

  it('routes same-repository conflicts to bounded smarter-model FX', () => {
    const plan = buildPlan(
      [
        pr({
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: greenRequired,
        }),
      ],
      {
        maxConcurrent: 40,
        runnerCapacity: 120,
        activeCi: 0,
        queuedCi: 0,
        cohortId: 'cohort-2-a',
      }
    );

    expect(plan.items[0]).toMatchObject({
      action: 'escalate_conflict_fx',
      triggersCi: true,
      attempt: 1,
      maxAttempts: 2,
      model: 'openai/gpt-5.6-sol',
      label: undefined,
    });
    expect(plan.fxMatrix).toEqual([
      expect.objectContaining({
        prNumber: 1,
        headRefOid: HEAD,
        baseRefOid: BASE,
        attempt: 1,
        maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
        model: CONFLICT_FX_MODEL,
      }),
    ]);
    expect(plan.summary).not.toHaveProperty('manualRebaseCandidates');

    const prompt = buildConflictFxPrompt({
      repository: 'JovieInc/Jovie',
      prNumber: 1,
      headOid: HEAD,
      baseOid: BASE,
      conflictFiles: ['scripts/conflicted.mjs'],
      attempt: 1,
    });
    expect(prompt).toContain(`Exact source head: ${HEAD}`);
    expect(prompt).toContain(`Exact base head: ${BASE}`);
    expect(prompt).toContain('Bounded attempt: 1/2');
    expect(prompt).toContain('separate follow-up PR');
    expect(prompt).toContain('or add a hold label');
    expect(prompt).not.toMatch(/needs-manual-rebase|needs-human/iu);
  });

  it('does not reuse a receipt after retargeting to a same-SHA base ref', () => {
    const plan = buildPlan(
      [
        pr({
          baseRefName: 'release/same-tree',
          baseRefOid: BASE,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: [
            ...greenRequired,
            conflictStatus({
              baseOid: BASE,
              baseRefName: 'main',
              attempt: 1,
              outcome: 'failed',
            }),
          ],
        }),
      ],
      { now: NOW, runnerCapacity: 120, maxConcurrent: 40 }
    );
    expect(plan.items[0]).toMatchObject({
      action: 'escalate_conflict_fx',
      attempt: 1,
    });
  });

  it('deliberate red: exhausted or expired attempts emit a typed non-blocking steering exception', () => {
    const expiredSecondClaim = conflictStatus({
      attempt: CONFLICT_FX_MAX_ATTEMPTS,
      outcome: 'pending',
      createdAt: new Date(NOW - CONFLICT_FX_CLAIM_TTL_MS - 1).toISOString(),
    });
    const plan = buildPlan(
      [
        pr({
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: [...greenRequired, expiredSecondClaim],
        }),
      ],
      { now: NOW, runnerCapacity: 120, maxConcurrent: 40 }
    );

    expect(plan.items[0]).toMatchObject({
      action: 'emit_steering_exception',
      triggersCi: false,
      attempt: CONFLICT_FX_MAX_ATTEMPTS,
      label: undefined,
    });
    expect(plan.fxMatrix).toEqual([]);

    const receipt = buildSteeringExceptionReceipt({
      prNumber: 1,
      headOid: HEAD,
      baseOid: BASE,
      attempts: CONFLICT_FX_MAX_ATTEMPTS,
      conflictFiles: ['scripts/conflicted.mjs'],
      competingChanges: [
        {
          file: 'scripts/conflicted.mjs',
          head: 'retain the shipping default',
          base: 'adopt the new product direction',
        },
      ],
      recommendedAction:
        'ship the objective fix now and put the product-direction choice in a separate follow-up PR',
    });
    expect(receipt).toEqual(
      expect.objectContaining({
        schema: CONFLICT_STEERING_EXCEPTION_SCHEMA,
        leaseTerminal: true,
        closedLoopTerminal: true,
        pr: 1,
        headOid: HEAD,
        baseOid: BASE,
        attempts: 2,
        blocksShippingPr: false,
        mergeBlockingLabels: [],
        steeringTiming: 'before_pr_or_separate_follow_up_pr',
      })
    );
    expect(receipt.conflictFiles).toEqual(['scripts/conflicted.mjs']);
    expect(receipt.competingChanges).toHaveLength(1);
    expect(receipt.nextAction).toContain('new exact head/base pair');
  });

  it('keeps taste and steering outside the shipping PR merge path', () => {
    const receipt = buildSteeringExceptionReceipt({
      prNumber: 1,
      headOid: HEAD,
      baseOid: BASE,
      conflictFiles: ['apps/web/app/page.tsx'],
      competingChanges: [
        {
          file: 'apps/web/app/page.tsx',
          head: 'existing approved treatment',
          base: 'new subjective treatment',
        },
      ],
    });
    const serialized = JSON.stringify(receipt);

    expect(receipt.blocksShippingPr).toBe(false);
    expect(receipt.mergeBlockingLabels).toEqual([]);
    expect(receipt.steeringTiming).toBe('before_pr_or_separate_follow_up_pr');
    expect(receipt.recommendedAction).toContain('separate follow-up PR');
    for (const forbidden of [
      'needs-human',
      'needs:taste',
      'needs-human-taste',
      'needs-manual-rebase',
      'hold',
      'gated',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });
});

describe('trusted exact-head conflict receipts', () => {
  it('round-trips a full exact base SHA without prefix matching', () => {
    const description = buildConflictFxStatusDescription({
      cohortId: 'cohort-1234567890123456789012345',
      cap: 40,
      attempt: 1,
      outcome: 'pending',
      baseOid: BASE,
    });
    expect(description).toContain(`base=${BASE}`);

    const receipt = parseConflictFxReceipt({
      ...conflictStatus(),
      description,
    });
    expect(receipt).toMatchObject({
      cohortId: 'cohort-1234567890123456789012345',
      cap: 40,
      attempt: 1,
      maxAttempts: CONFLICT_FX_MAX_ATTEMPTS,
      outcome: 'pending',
      baseOid: BASE,
    });

    const plan = buildPlan(
      [
        pr({
          baseRefOid: OTHER_BASE_WITH_SAME_PREFIX,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          statusCheckRollup: [
            ...greenRequired,
            conflictStatus({ baseOid: BASE, attempt: 1, outcome: 'failed' }),
          ],
        }),
      ],
      { now: NOW, runnerCapacity: 120, maxConcurrent: 40 }
    );
    expect(plan.items[0]).toMatchObject({
      action: 'escalate_conflict_fx',
      attempt: 1,
    });
  });

  it('deliberate red: rejects truncated, malformed, or untrusted conflict receipts', () => {
    expect(parseConflictFxReceipt(conflictStatus())).not.toBeNull();
    expect(
      parseConflictFxReceipt(
        conflictStatus({
          creator: { login: 'untrusted-contributor', type: 'User' },
        })
      )
    ).toBeNull();
    expect(
      parseConflictFxReceipt(
        conflictStatus({
          targetUrl: 'https://example.invalid/forged-conflict-receipt',
        })
      )
    ).toBeNull();
    expect(
      parseConflictFxReceipt(conflictStatus({ typename: 'CheckRun' }))
    ).toBeNull();

    const trusted = conflictStatus();
    for (const description of [
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=2 attempt=3/2 outcome=pending base=${BASE}`,
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=-1 attempt=1/2 outcome=pending base=${BASE}`,
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=2 attempt=1/99 outcome=pending base=${BASE}`,
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=2 attempt=1/2 outcome=forged base=${BASE}`,
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=2 attempt=1/2 outcome=success base=${BASE}`,
      `${CONFLICT_FX_RECEIPT_SCHEMA} cohort=c cap=2 attempt=1/2 outcome=pending base=${BASE.slice(0, 12)}`,
    ]) {
      expect(parseConflictFxReceipt({ ...trusted, description })).toBeNull();
    }
  });

  it('accepts durable cohorts only from the trusted controller and validates their metrics', () => {
    const marker = buildConflictFxCohortMarker(
      cohort({ id: 'cohort-10-trusted' })
    );
    const trusted = {
      body: marker,
      user: { login: TRUSTED_APP_LOGIN, type: 'Bot' },
      author_association: 'MEMBER',
      created_at: '2026-08-30T17:00:00Z',
      html_url: 'https://github.com/JovieInc/Jovie/issues/comments/123456789',
    };
    expect(parseConflictFxCohortComments([trusted])).toEqual([
      expect.objectContaining({
        id: 'cohort-10-trusted',
        cap: 10,
        attempted: 10,
        successes: 10,
        failures: 0,
        pending: 0,
        staleHeadSkips: 0,
        staleHeadSkipRate: 0,
        p95CiLatencyMs: 300_000,
        baselineP95CiLatencyMs: 300_000,
        runnerCapacity: 120,
        activeCi: 0,
        queuedCi: 0,
        backlog: 80,
        runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
        clean: true,
      }),
    ]);
    expect(
      parseConflictFxCohortComments([
        {
          ...trusted,
          user: { login: 'untrusted-contributor', type: 'User' },
        },
      ])
    ).toEqual([]);

    const impossible = buildConflictFxCohortMarker(
      cohort({
        id: 'cohort-impossible',
        attempted: 2,
        successes: 3,
        failures: 1,
      })
    );
    expect(
      parseConflictFxCohortComments([{ ...trusted, body: impossible }])
    ).toEqual([]);
  });
});

describe('adaptive conflict capacity', () => {
  const capacityInput = {
    runnerCapacity: 120,
    activeCi: 0,
    queuedCi: 0,
    backlog: 80,
  };

  it('ramps adaptive conflict cohorts only after durable clean receipts', () => {
    expect(computeAdaptiveConcurrency(capacityInput)).toMatchObject({
      tier: 2,
      cap: 2,
    });

    const cleanCanary = cohort({
      id: 'cohort-2-clean',
      cap: 2,
      attempted: 2,
      successes: 2,
      createdAt: '2026-08-30T15:00:00Z',
    });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [cleanCanary],
      })
    ).toMatchObject({ tier: 10, cap: 10 });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [{ ...cleanCanary, durable: false }],
      })
    ).toMatchObject({ tier: 2, cap: 2 });

    const partialTenA = cohort({
      id: 'cohort-10-partial-a',
      attempted: 2,
      successes: 2,
      createdAt: '2026-08-30T16:00:00Z',
    });
    const partialTenB = cohort({
      id: 'cohort-10-partial-b',
      attempted: 2,
      successes: 2,
      createdAt: '2026-08-30T15:30:00Z',
    });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [partialTenA, partialTenB, cleanCanary],
      })
    ).toMatchObject({ tier: 10, cap: 10 });

    const cleanTenA = cohort({
      id: 'cohort-10-clean-a',
      createdAt: '2026-08-30T17:00:00Z',
    });
    const cleanTenB = cohort({
      id: 'cohort-10-clean-b',
      createdAt: '2026-08-30T16:30:00Z',
    });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [cleanTenA, cleanTenB, cleanCanary],
      })
    ).toMatchObject({ tier: 40, cap: 40 });

    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        runnerCapacity: 12,
        activeCi: 7,
        queuedCi: 1,
        recentCohorts: [cleanTenA, cleanTenB],
      })
    ).toMatchObject({ tier: 10, availableRunners: 4, cap: 4 });
  });

  it('releases expired pending claims instead of deadlocking the canary budget', () => {
    const pending = cohort({
      id: 'cohort-pending',
      cap: 2,
      attempted: 0,
      successes: 0,
      failures: 0,
      pending: 2,
      clean: false,
      durable: false,
      createdAt: new Date(NOW - 60_000).toISOString(),
    });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [pending],
        now: NOW,
      })
    ).toMatchObject({ tier: 2, cap: 0, pendingRemediations: 2 });
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [
          {
            ...pending,
            createdAt: new Date(
              NOW - CONFLICT_FX_CLAIM_TTL_MS - 1
            ).toISOString(),
          },
        ],
        now: NOW,
      })
    ).toMatchObject({ tier: 2, cap: 2, pendingRemediations: 0 });
  });

  it('deliberate red: degraded CI or remediation failure backs concurrency down', () => {
    const cleanTenA = cohort({
      id: 'cohort-10-clean-a',
      createdAt: '2026-08-30T17:00:00Z',
    });
    const cleanTenB = cohort({
      id: 'cohort-10-clean-b',
      createdAt: '2026-08-30T16:30:00Z',
    });
    const healthy = [cleanTenA, cleanTenB];
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: healthy,
      }).tier
    ).toBe(40);

    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [
          cohort({
            id: 'cohort-failed',
            successes: 9,
            failures: 1,
            clean: false,
            createdAt: '2026-08-30T17:30:00Z',
          }),
          ...healthy,
        ],
      }).tier
    ).toBe(2);
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [
          cohort({
            id: 'cohort-relative-latency-regressed',
            p95CiLatencyMs: 600_000,
            baselineP95CiLatencyMs: 300_000,
            clean: true,
            createdAt: '2026-08-30T17:30:00Z',
          }),
          ...healthy,
        ],
      }).tier
    ).toBe(2);
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [
          cohort({
            id: 'cohort-absolute-latency-regressed',
            p95CiLatencyMs: 780_000,
            baselineP95CiLatencyMs: 600_000,
            clean: true,
            createdAt: '2026-08-30T17:30:00Z',
          }),
          ...healthy,
        ],
      }).tier
    ).toBe(2);
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        recentCohorts: [
          cohort({
            id: 'cohort-stale-skips',
            staleHeadSkips: 1,
            staleHeadSkipRate: 0.1,
            clean: true,
            createdAt: '2026-08-30T17:30:00Z',
          }),
          ...healthy,
        ],
      }).tier
    ).toBe(2);
    expect(
      computeAdaptiveConcurrency({
        ...capacityInput,
        activeCi: 62,
        queuedCi: 10,
        recentCohorts: healthy,
      }).tier
    ).toBe(10);
  });
});

describe('conflict workflow contract', () => {
  it('computes the FX matrix from live runner and CI pressure instead of a fixed fleet number', () => {
    expect(WORKFLOW).toContain(CONFLICT_CLOSED_LOOP_INVARIANT_ID);
    expect(WORKFLOW).toMatch(
      /(?:actions\/runs\?[^\n]*status=in_progress|gh run list[^\n]*--status[= ]in_progress)/u
    );
    expect(WORKFLOW).toMatch(
      /(?:actions\/runs\?[^\n]*status=queued|gh run list[^\n]*--status[= ]queued)/u
    );
    expect(WORKFLOW).toContain('--runner-capacity');
    expect(WORKFLOW).toContain('--active-ci');
    expect(WORKFLOW).toContain('--queued-ci');
    expect(WORKFLOW).toContain('--plan-file');
    expect(WORKFLOW).toMatch(/fromJSON\([^\n]*fx_matrix/iu);
    const dynamicCaps =
      WORKFLOW.match(
        /max-parallel:\s*\$\{\{\s*fromJSON\(needs\.plan\.outputs\.adaptive_cap\)\s*\}\}/gu
      ) ?? [];
    expect(dynamicCaps.length).toBeGreaterThanOrEqual(2);
  });

  it('persists trusted adaptive cohort evidence after the repair matrix settles', () => {
    expect(WORKFLOW).toMatch(
      new RegExp(
        `(?:buildConflictFxCohortMarker|${CONFLICT_FX_COHORT_SCHEMA.replaceAll('/', '\\/')})`,
        'u'
      )
    );
    for (const field of [
      'staleHeadSkips',
      'staleHeadSkipRate',
      'p95CiLatencyMs',
      'baselineP95CiLatencyMs',
      'runnerCapacity',
      'activeCi',
      'queuedCi',
      'backlog',
      'runUrl',
    ]) {
      expect(WORKFLOW).toContain(field);
    }
    expect(WORKFLOW).toMatch(
      /gh\s+api\s+-X\s+POST[^\n]*(?:issues\/[^\s"']+\/comments|issues\/\$[A-Z_]+\/comments)/iu
    );
    expect(WORKFLOW).toContain('head_sha=$resolved_head');
    expect(WORKFLOW).toContain('ci-latencies.txt');
    expect(WORKFLOW).toContain('latest_check("PR Ready")');
    expect(WORKFLOW).toContain('latest_check("Migration Guard")');
    expect(WORKFLOW).toContain('latest_status("Fork PR Gate")');
    expect(WORKFLOW).not.toContain(
      'actions/workflows/ci.yml/runs?status=completed&per_page=50'
    );
  });

  it('binds the stronger FX model and immutable artifact before granting writer authority', () => {
    expect(WORKFLOW).toMatch(/FX_MODEL:\s*['"]?openai\/gpt-5\.6-sol['"]?/u);
    expect(WORKFLOW).toContain('AI_GATEWAY_API_KEY');
    expect(WORKFLOW).toContain('fx ask');
    expect(WORKFLOW).toContain('jovie-conflict-fx-artifact/v1');
    expect(WORKFLOW).toMatch(/(?:\.|[,{])pr[=:]/u);
    expect(WORKFLOW).toMatch(/(?:\.|[,{])(?:sourceHead|head)[=:]/u);
    expect(WORKFLOW).toMatch(/(?:\.|[,{])(?:baseHead|base)[=:]/u);
    expect(WORKFLOW).toMatch(/(?:\.|[,{])attempt[=:]/u);
    expect(WORKFLOW).toMatch(
      /(?:\.|[,{])(?:expectedModel|observedModel|model)[=:]/u
    );

    const fxJob = WORKFLOW.slice(
      WORKFLOW.indexOf('\n  conflict_fx:'),
      WORKFLOW.indexOf('\n  deliver:')
    );
    expect(fxJob).toContain('AI_GATEWAY_API_KEY');
    expect(fxJob).toContain('FX_MODEL: openai/gpt-5.6-sol');
    expect(fxJob).not.toContain('actions/create-github-app-token@');
    expect(fxJob).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(fxJob).not.toContain('GH_TOKEN:');

    const modelStep = workflowStep(
      'Run pinned stronger-model FX with no executable tools'
    );
    expect(modelStep).toContain(
      'AI_GATEWAY_API_KEY: ${{ secrets.AI_GATEWAY_API_KEY }}'
    );
    expect(WORKFLOW.replace(modelStep, '')).not.toContain('AI_GATEWAY_API_KEY');
    expect(modelStep).toContain('HOME: ${{ runner.temp }}/fx-home');
    expect(modelStep).toContain('.session_permission_grants == 0');
    expect(modelStep).toContain('.mcp.connection_check == "not_checked"');
    expect(modelStep).toContain('exec fx ask --json --no-save');
    expect(modelStep).not.toMatch(/\b(?:git|gh|pnpm|npm|yarn)\s/u);
    expect(modelStep).not.toMatch(/--(?:auto|yolo)\b/u);
    expect(modelStep).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(modelStep).not.toContain('GH_TOKEN');
    for (const runBody of workflowRunBodies()) {
      expect(runBody).not.toMatch(/\$\{\{\s*(?:matrix\.|github\.event)/u);
    }

    const fxIndex = WORKFLOW.indexOf('fx ask');
    const immutableValidationIndex = WORKFLOW.lastIndexOf(
      'sha256sum --check --strict'
    );
    const appTokens = [
      ...WORKFLOW.matchAll(/actions\/create-github-app-token@/gu),
    ];
    const writerAppTokenIndex = appTokens.at(-1)?.index ?? -1;
    const writerTokenStepStart = WORKFLOW.lastIndexOf(
      '- name: Generate short-lived Jovie App writer token'
    );
    const writerTokenStepEnd = WORKFLOW.indexOf(
      '\n      - name:',
      writerTokenStepStart + 1
    );
    const writerTokenStep = WORKFLOW.slice(
      writerTokenStepStart,
      writerTokenStepEnd
    );
    expect(fxIndex).toBeGreaterThan(-1);
    expect(immutableValidationIndex).toBeGreaterThan(fxIndex);
    expect(appTokens.length).toBeGreaterThanOrEqual(2);
    expect(writerAppTokenIndex).toBeGreaterThan(immutableValidationIndex);
    expect(writerTokenStep).toMatch(
      /if:\s*[^\n]*steps\.prevalidate\.outputs\.(?:trusted|validated|deliverable)[^\n]*==\s*['"]true['"]/u
    );
    expect(WORKFLOW).toContain('app-id: ${{ vars.JOVIE_BOT_APP_ID }}');
    expect(WORKFLOW).toContain(
      'private-key: ${{ secrets.JOVIE_BOT_PRIVATE_KEY }}'
    );
    expect(WORKFLOW).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(WORKFLOW).toContain('expected-merge-manifest.json');
    expect(WORKFLOW).toContain('candidate-merge-manifest.json');
    expect(WORKFLOW).toContain('live_conflict_files');
    expect(WORKFLOW).toMatch(
      /cmp\s+--silent\s+"\$expected_manifest"\s+"\$candidate_manifest"/u
    );
    expect(WORKFLOW).toContain(
      'conflict candidate introduced an unsafe entry type'
    );
  });

  it('deliberate red: workflow refuses stale-head or force-push conflict delivery', () => {
    expect(WORKFLOW).not.toContain('expected_base:0:12');
    expect(WORKFLOW).not.toContain('BASE_HEAD:0:12');
    const pushMatch =
      /git[\s\S]{0,240}?\bpush\s+"https:\/\/github\.com\/\$REPOSITORY\.git"\s+"(?:HEAD|\$[A-Z_]*(?:HEAD|COMMIT)):refs\/heads\/\$HEAD_REF"/iu.exec(
        WORKFLOW
      );
    expect(pushMatch).not.toBeNull();
    const pushIndex = pushMatch?.index ?? -1;
    const liveReadIndex = WORKFLOW.lastIndexOf('pulls/$PR_NUMBER', pushIndex);
    expect(liveReadIndex).toBeGreaterThan(-1);
    const prePush = WORKFLOW.slice(liveReadIndex, pushIndex);
    expect(prePush).toContain('.head.sha');
    expect(prePush).toContain('.base.sha');
    expect(prePush).toMatch(/\.state|isDraft|\.draft/u);
    expect(prePush).toMatch(/same_repo|full_name/u);
    expect(WORKFLOW).toMatch(/rev-parse HEAD|HEAD\^\{commit\}/u);

    expect(WORKFLOW).not.toMatch(
      /git[\s\S]{0,160}?\bpush\b[^\n]*(?:--force(?:-with-lease)?|\s-f(?:\s|$))/u
    );
    expect(WORKFLOW).not.toContain('force-with-lease');
    expect(WORKFLOW).not.toMatch(/\bgh\s+pr\s+merge\b/u);
  });

  it('preserves native auto-merge without a ready-for-review or dequeue side flight', () => {
    expect(WORKFLOW).not.toMatch(/types:\s*\[[^\]]*ready_for_review[^\]]*\]/u);
    expect(WORKFLOW).not.toMatch(/\bgh\s+pr\s+ready\b/u);
    expect(WORKFLOW).not.toContain('dequeuePullRequest');
    expect(WORKFLOW).not.toContain('disablePullRequestAutoMerge');
    expect(WORKFLOW).not.toMatch(/merge-queue-backend\.mjs\s+dequeue/u);
    expect(WORKFLOW).not.toContain('withgraphite/graphite-ci-action');
    expect(WORKFLOW).not.toContain('steps.graphite');

    const autoMergeReads = WORKFLOW.match(/autoMergeRequest/gu) ?? [];
    expect(autoMergeReads.length).toBeGreaterThanOrEqual(2);
    expect(WORKFLOW).toContain('isInMergeQueue');
    expect(WORKFLOW).toContain('mergeQueueEntry');
    expect(WORKFLOW.match(/GH_QUEUE_TOKEN: \$\{\{ github\.token \}\}/gu)).toHaveLength(
      3
    );
    expect(
      WORKFLOW.match(/GH_TOKEN="\$GH_QUEUE_TOKEN" gh api graphql/gu)
    ).toHaveLength(2);
  });
});
