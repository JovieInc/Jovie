import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { OvieInbox, OvieInboxCase } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import {
  type CountMeasurement,
  type DeliverySummary,
  emptyDeliverySummary,
} from '@/lib/ovie/shipping-state/contract';
import {
  buildConstraint,
  buildDoneToday,
  buildOvieAsks,
  buildOvieHomeShipping,
  buildPulse,
  buildShipRows,
  buildStageLatency,
  mergeDoneWithRecent,
  OVIE_NOT_MEASURED,
  OVIE_SHIP_STAGES,
  shipStageForTask,
  stageLabel,
} from './shipping-home';

type Feed = ShippingCockpitProjection['operationalTasks'];
type Task = Feed['tasks'][number];
type Rollup = 'success' | 'failure' | 'pending' | 'unknown';

const SINCE = '2026-10-20T07:00:00.000Z';

function count(value: number | null): CountMeasurement {
  if (value === null) return { state: 'not-measured', value: null };
  if (value === 0) return { state: 'measured-zero', value: 0 };
  return { state: 'measured-nonzero', value };
}

function task(
  id: number,
  workflowState: Task['workflowState'],
  options: { rollup?: Rollup; updatedAt?: string | null; pr?: boolean } = {}
): Task {
  const pr = options.pr ?? true;
  return {
    id: `linear:JOV-${id}`,
    linearIdentifier: `JOV-${id}`,
    linearUrl: `https://linear.app/jovie/issue/JOV-${id}`,
    title: `Task ${id}`,
    workflowState,
    priority: 'medium',
    attempt: null,
    retryAt: null,
    sourceRevision: null,
    updatedAt:
      options.updatedAt === undefined
        ? '2026-10-20T18:00:00.000Z'
        : options.updatedAt,
    pullRequest: pr
      ? {
          number: 22000 + id,
          url: `https://github.com/JovieInc/Jovie/pull/${22000 + id}`,
          branch: null,
          agent: null,
          isDraft: false,
          checks: { rollup: options.rollup ?? 'unknown', failing: [] },
          queuePosition: null,
          queueState: null,
          createdAt: null,
        }
      : null,
  };
}

function feed(tasks: Task[], syncState: Feed['syncState'] = 'fresh'): Feed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState,
    sourceId: 'lane-pull-requests',
    observedAt: null,
    lastSyncedAt: null,
    freshnessDeadline: null,
    tasks,
    deltas: [],
  };
}

function delivery(patch: Partial<DeliverySummary> = {}): DeliverySummary {
  return { ...emptyDeliverySummary(), ...patch };
}

function measuredDelivery(): DeliverySummary {
  const empty = emptyDeliverySummary();
  return delivery({
    lanes: {
      ...empty.lanes,
      running: count(3),
      slots: count(4),
      diskFreePct: 18.4,
      heldByReason: { budget: 0 },
      publishedAt: '2026-10-20T18:00:00.000Z',
    },
    merges: {
      ...empty.merges,
      since: SINCE,
      today: count(7),
      last7Days: count(40),
      prior7Days: count(31),
    },
    mergeQueueDepth: count(2),
    production: {
      sha: 'c9b767a1234567890',
      version: null,
      deployedAt: null,
      behindMain: count(0),
    },
  });
}

describe('shipStageForTask', () => {
  it.each([
    ['queued', 'unknown', 'investigating', null],
    ['blocked', 'unknown', 'investigating', 'blocked'],
    ['running', 'pending', 'building', null],
    ['running', 'failure', 'building', 'failing'],
    ['retrying', 'unknown', 'building', 'retrying'],
    ['in-review', 'success', 'tested', null],
    ['in-review', 'pending', 'building', null],
    ['in-review', 'failure', 'building', 'failing'],
    ['merge-queued', 'success', 'merging', null],
    ['merged', 'success', 'deployed', null],
    ['production-verified', 'success', 'verified', null],
  ] as const)(
    'maps %s with %s checks to %s',
    (state, rollup, stage, attention) => {
      const result = shipStageForTask(task(1, state, { rollup }));
      expect(result.stage).toBe(stage);
      expect(result.attention).toBe(attention);
      expect(result.complete).toBe(state === 'production-verified');
    }
  );

  it('never claims tested without pull-request evidence', () => {
    expect(shipStageForTask(task(1, 'in-review', { pr: false })).stage).toBe(
      'building'
    );
  });
});

describe('buildShipRows', () => {
  it('orders attention first, then furthest along, and drops verified work', () => {
    const rows = buildShipRows(
      feed([
        task(1, 'queued'),
        task(2, 'merge-queued'),
        task(3, 'retrying'),
        task(4, 'production-verified'),
        task(5, 'blocked'),
        task(6, 'running', { rollup: 'failure' }),
        task(7, 'merged'),
      ])
    );
    expect(rows.map(row => row.identifier)).toEqual([
      'JOV-5',
      'JOV-6',
      'JOV-3',
      'JOV-7',
      'JOV-2',
      'JOV-1',
    ]);
    expect(rows[3]).toMatchObject({
      stage: 'deployed',
      stageIndex: OVIE_SHIP_STAGES.indexOf('deployed'),
      pullRequestNumber: 22007,
    });
  });

  it('falls back to the Linear URL when there is no pull request', () => {
    const [row] = buildShipRows(feed([task(9, 'queued', { pr: false })]));
    expect(row?.url).toBe('https://linear.app/jovie/issue/JOV-9');
  });

  it('renders an empty list for an empty feed', () => {
    expect(buildShipRows(feed([]))).toEqual([]);
  });
});

describe('buildDoneToday', () => {
  it('lists work landed since the published day boundary, newest first', () => {
    const done = buildDoneToday(
      feed([
        task(1, 'merged', { updatedAt: '2026-10-20T08:00:00.000Z' }),
        task(2, 'production-verified', {
          updatedAt: '2026-10-20T19:00:00.000Z',
        }),
        task(3, 'merged', { updatedAt: '2026-10-19T23:00:00.000Z' }),
        task(4, 'running', { updatedAt: '2026-10-20T19:30:00.000Z' }),
        task(5, 'merged', { updatedAt: null }),
      ]),
      SINCE
    );
    expect(done).toEqual([
      {
        id: 'linear:JOV-2',
        label: 'Task 2 · #22002',
        url: 'https://github.com/JovieInc/Jovie/pull/22002',
        verified: true,
      },
      {
        id: 'linear:JOV-1',
        label: 'Task 1 · #22001',
        url: 'https://github.com/JovieInc/Jovie/pull/22001',
        verified: false,
      },
    ]);
  });

  it('claims nothing when the day boundary is not measured', () => {
    expect(buildDoneToday(feed([task(1, 'merged')]), null)).toEqual([]);
  });
});

function onTargetDelivery(): DeliverySummary {
  const base = measuredDelivery();
  return delivery({
    ...base,
    lanes: {
      ...base.lanes,
      running: count(4),
      slots: count(4),
      flow: {
        openPrs: 40,
        redPrs: 2,
        dirtyPrs: 0,
        cleanNotQueued: 0,
        exhaustedPrs: 0,
        mergesPerHour: 2,
        queueEjectionRate: 0.05,
        queueWaitP95Seconds: 600,
        productionLagP95Seconds: 900,
        eligiblePool: 5,
        candidatePool: 8,
        ownerless: 0,
        regressions: [],
        at: '2026-10-20T18:00:00.000Z',
      },
    },
    merges: { ...base.merges, last7Days: count(175), prior7Days: count(140) },
  });
}

describe('buildPulse', () => {
  it('shows Not measured, neutral tone, and no was for an empty summary', () => {
    const pulse = buildPulse(delivery());
    expect(pulse.map(tile => tile.key)).toEqual([
      'merges-day',
      'ejections',
      'prod',
      'lyb-deploy',
      'lanes',
      'ownerless',
    ]);
    for (const tile of pulse) {
      expect(tile.value).toBe(OVIE_NOT_MEASURED);
      expect(tile.measured).toBe(false);
      expect(tile.tone).toBe('neutral');
      expect(tile.was).toBeNull();
    }
  });

  it('gives every tile a target and a drill-down, never a raw counter', () => {
    for (const tile of buildPulse(onTargetDelivery())) {
      expect(tile.target, tile.key).toMatch(/^Target /);
      expect(tile.href, tile.key).toMatch(/^\/app\/ov\//);
    }
  });

  it('judges each value against its target', () => {
    const byKey = Object.fromEntries(
      buildPulse(onTargetDelivery()).map(tile => [tile.key, tile])
    );
    expect(byKey['merges-day']).toMatchObject({
      value: '25',
      was: '20 prior 7d',
      tone: 'good',
      target: 'Target ≥ 20',
    });
    expect(byKey.ejections).toMatchObject({ value: '5%', tone: 'good' });
    expect(byKey.prod).toMatchObject({ value: 'Current', tone: 'good' });
    expect(byKey.lanes).toMatchObject({ value: '4 of 4', tone: 'good' });
    expect(byKey.ownerless).toMatchObject({ value: '0', tone: 'good' });
  });

  it('turns warn when off target and bad when more than twice off', () => {
    const base = onTargetDelivery();
    const flow = base.lanes.flow;
    if (!flow) throw new Error('fixture has flow');
    const byKey = Object.fromEntries(
      buildPulse(
        delivery({
          ...base,
          lanes: {
            ...base.lanes,
            running: count(1),
            flow: { ...flow, queueEjectionRate: 0.58, ownerless: 6 },
          },
          merges: { ...base.merges, last7Days: count(105) },
          production: { ...base.production, behindMain: count(1) },
        })
      ).map(tile => [tile.key, tile])
    );
    expect(byKey['merges-day']).toMatchObject({ value: '15', tone: 'warn' });
    expect(byKey.ejections).toMatchObject({ value: '58%', tone: 'bad' });
    expect(byKey.prod).toMatchObject({
      value: '1 behind',
      tone: 'warn',
    });
    expect(byKey.lanes).toMatchObject({ value: '1 of 4', tone: 'bad' });
    expect(byKey.ownerless).toMatchObject({ value: '6', tone: 'bad' });
  });

  it('shows LogYourBody production deploy health on Home, failing in bad tone', () => {
    const base = measuredDelivery();
    const withHealth = (
      repo: Partial<{
        status: 'ok' | 'failing' | 'unknown';
        failedStreak: number;
        behindMain: number | null;
      }>
    ) =>
      Object.fromEntries(
        buildPulse(
          delivery({
            ...base,
            lanes: {
              ...base.lanes,
              deployHealth: {
                observedAt: '2026-10-25T17:24:52.000Z',
                healthy: false,
                repos: [
                  {
                    repo: 'JovieInc/LogYourBody',
                    status: 'ok',
                    failedStreak: 0,
                    behindMain: 0,
                    oldestUnshippedAgeSeconds: null,
                    lastSuccessAt: null,
                    ...repo,
                  },
                ],
              },
            },
          })
        ).map(tile => [tile.key, tile])
      );
    expect(
      withHealth({ status: 'failing', failedStreak: 21, behindMain: 87 })[
        'lyb-deploy'
      ]
    ).toMatchObject({
      label: 'LYB prod',
      value: 'Failing, 87 behind',
      tone: 'bad',
      measured: true,
    });
    expect(withHealth({ behindMain: 4 })['lyb-deploy']).toMatchObject({
      value: '4 behind',
      tone: 'warn',
    });
    expect(withHealth({ behindMain: 0 })['lyb-deploy']).toMatchObject({
      value: 'Current',
      tone: 'good',
    });
    expect(withHealth({ status: 'unknown' })['lyb-deploy']).toMatchObject({
      value: OVIE_NOT_MEASURED,
      measured: false,
      tone: 'neutral',
    });
    // No published block is Not measured, never healthy.
    expect(
      Object.fromEntries(buildPulse(base).map(tile => [tile.key, tile]))[
        'lyb-deploy'
      ]
    ).toMatchObject({ value: OVIE_NOT_MEASURED, tone: 'neutral' });
  });

  it('compares against the value at the last visit', () => {
    const base = onTargetDelivery();
    const pulse = buildPulse(base, {
      prod: { value: '3 behind', was: null },
      ejections: { value: '5%', was: null },
    });
    expect(pulse.find(t => t.key === 'prod')?.was).toBe('3 behind');
    // Unchanged since the last visit: nothing to compare.
    expect(pulse.find(t => t.key === 'ejections')?.was).toBeNull();
    // Unmeasured tiles never show a comparison.
    expect(
      buildPulse(delivery(), { prod: { value: 'Current', was: null } }).find(
        t => t.key === 'prod'
      )?.was
    ).toBeNull();
  });
});

describe('buildConstraint', () => {
  const rows = (tasks: Task[]) => buildShipRows(feed(tasks));

  it('leads with a degraded fleet and links to it', () => {
    const base = measuredDelivery();
    expect(
      buildConstraint(
        delivery({
          ...base,
          lanes: {
            ...base.lanes,
            alerts: ['  ', '0 of 28 Todo issues eligible'],
          },
        }),
        rows([task(1, 'blocked')]),
        'fresh'
      )
    ).toEqual({
      tone: 'bad',
      text: 'Shipping off target: fleet degraded (1 alert) · 6 merges/day (target 20) · +2 more',
      detailsHref: APP_ROUTES.ADMIN_OPERATIONS,
    });
  });

  it('names a raw doctor diagnostic in operator copy, never the raw string', () => {
    const base = measuredDelivery();
    const constraint = buildConstraint(
      delivery({
        ...base,
        lanes: {
          ...base.lanes,
          alerts: [
            'remediation action lacks authoritative acknowledgement; failed=45, exhausted=0, next retry=None; inspect event-delivery.json',
          ],
        },
      }),
      [],
      'fresh'
    );
    expect(constraint).toMatchObject({
      tone: 'bad',
      detailsHref: APP_ROUTES.ADMIN_OPERATIONS,
    });
    expect(constraint?.text).toContain('fleet degraded (1 alert)');
    expect(constraint?.text).not.toMatch(/event-delivery|failed=45/);
  });

  it('never says shipping is fine without evidence (guard)', () => {
    // Tim 2026-10-30: "Nothing is blocking shipping" sat beside a 58% queue
    // ejection rate. The clear verdict now requires every input measured.
    const verdict = buildConstraint(delivery(), [], 'fresh');
    expect(verdict).not.toBeNull();
    expect(verdict?.text).toMatch(/^Shipping health unknown: /);
    expect(buildConstraint(onTargetDelivery(), [], 'syncing')).toMatchObject({
      tone: 'warn',
      text: 'Shipping health unknown: work items not measured',
    });
  });

  it('names breaches worst first, from the same evidence as the tiles', () => {
    const base = onTargetDelivery();
    const flow = base.lanes.flow;
    if (!flow) throw new Error('fixture has flow');
    const verdict = buildConstraint(
      delivery({
        ...base,
        lanes: { ...base.lanes, flow: { ...flow, queueEjectionRate: 0.58 } },
        production: { ...base.production, behindMain: count(1) },
      }),
      rows([task(1, 'blocked'), task(2, 'running', { rollup: 'failure' })]),
      'fresh'
    );
    expect(verdict).toEqual({
      tone: 'bad',
      text: 'Shipping off target: 58% of queue entries ejected (target 10%) · 1 item blocked · +2 more',
      detailsHref: APP_ROUTES.ADMIN_SHIPPING,
    });
  });

  it('is clear only when every input is measured and on target', () => {
    expect(buildConstraint(onTargetDelivery(), [], 'fresh')).toBeNull();
  });
});

describe('buildOvieHomeShipping', () => {
  it('composes constraint, pulse, rows, and done today from one read', () => {
    const home = buildOvieHomeShipping({
      delivery: onTargetDelivery(),
      operationalTasks: feed([
        task(1, 'running', { rollup: 'pending' }),
        task(2, 'production-verified'),
      ]),
    });
    expect(home.constraint).toBeNull();
    expect(home.rows.map(row => row.identifier)).toEqual(['JOV-1']);
    expect(home.done.map(item => item.id)).toEqual(['linear:JOV-2']);
    expect(home.mergesToday).toBe(7);
    expect(home.tasksSyncState).toBe('fresh');
  });

  it('keeps every block unmeasured for an empty summary', () => {
    const home = buildOvieHomeShipping({
      delivery: delivery(),
      operationalTasks: feed([task(2, 'production-verified')], 'syncing'),
    });
    expect(home.mergesToday).toBeNull();
    expect(home.done).toEqual([]);
    expect(home.constraint?.text).toMatch(/^Shipping health unknown/);
  });
});

describe('buildOvieAsks', () => {
  function inboxCase(
    id: string,
    state: OvieInboxCase['state'],
    decidable = true
  ): OvieInboxCase {
    return {
      contract: INTERACTION_CASE_CONTRACT,
      id,
      kind: 'spend',
      source: { system: 'summer', id, revision: null },
      title: `Ask ${id}`,
      recommendation: 'Approve',
      owner: null,
      state,
      priority: 1,
      createdAt: '2026-10-20T18:00:00.000Z',
      nextAction: null,
      waitingUntil: null,
      confidence: null,
      evidence: ['https://example.com/receipt'],
      body: 'Why this matters',
      decisionTarget: decidable ? { kind: 'summer', id } : null,
    };
  }

  it('badges escalated no-default cases and ignores anything else', () => {
    const cases: readonly OvieInboxCase[] = [
      {
        ...inboxCase('late', 'needs_you'),
        escalation: { level: 2, waitingHours: 52.7 },
      },
      {
        ...inboxCase('fresh', 'needs_you'),
        escalation: { level: 0, waitingHours: 3 },
      },
      {
        ...inboxCase('odd', 'needs_you'),
        escalation: { level: 'high' },
      } as unknown as OvieInboxCase,
    ];
    const asks = buildOvieAsks({ issues: [], cases });
    expect(asks.map(ask => ask.escalation)).toEqual([
      { level: 2, waitingHours: 52 },
      null,
      null,
    ]);
  });

  it('keeps only founder decisions, in inbox order', () => {
    const inbox: OvieInbox = {
      cases: [
        inboxCase('a', 'needs_you'),
        inboxCase('b', 'waiting'),
        inboxCase('c', 'needs_you', false),
        {
          ...inboxCase('d', 'needs_you'),
          decisionTarget: { kind: 'linear', id: 'd' },
        },
      ],
      issues: [],
    };
    expect(buildOvieAsks(inbox)).toEqual([
      {
        id: 'a',
        title: 'Ask a',
        recommendation: 'Approve',
        why: 'Why this matters',
        decidable: true,
        actionLabel: 'Approve',
        canReply: true,
        evidence: ['https://example.com/receipt'],
        decisionDefault: null,
        canFeedback: true,
        escalation: null,
      },
      {
        id: 'c',
        title: 'Ask c',
        recommendation: 'Approve',
        why: 'Why this matters',
        decidable: false,
        actionLabel: 'Approve',
        canReply: false,
        evidence: ['https://example.com/receipt'],
        decisionDefault: null,
        canFeedback: false,
        escalation: null,
      },
      {
        id: 'd',
        title: 'Ask d',
        recommendation: 'Approve',
        why: 'Why this matters',
        decidable: true,
        actionLabel: 'Mark done',
        // Linear replies are posted back to the issue as the answer.
        canReply: true,
        evidence: ['https://example.com/receipt'],
        decisionDefault: null,
        canFeedback: false,
        escalation: null,
      },
    ]);
  });

  it('names certification as certify rather than approve', () => {
    const inbox: OvieInbox = {
      cases: [
        {
          ...inboxCase('cert', 'needs_you'),
          decisionTarget: {
            kind: 'certification',
            id: 'cert',
            evidenceDigest: 'digest',
          },
        },
      ],
      issues: [],
    };
    expect(buildOvieAsks(inbox)[0]?.actionLabel).toBe('Certify');
  });

  it('maps the decision default contract and ignores malformed defaults', () => {
    const withDefault = {
      ...inboxCase('a', 'needs_you'),
      decisionDefault: {
        contract: 'jovie.decision-default/v1',
        decision: 'reject',
        summary: 'Keep the current copy',
        deadline: '2026-10-22T12:00:00.000Z',
        declared: true,
      },
    } as OvieInboxCase;
    const malformed = {
      ...inboxCase('b', 'needs_you'),
      decisionDefault: { contract: 'other/v1', decision: 'approve' },
    } as unknown as OvieInboxCase;
    const [first, second] = buildOvieAsks({
      cases: [withDefault, malformed],
      issues: [],
    });
    expect(first?.decisionDefault).toEqual({
      decision: 'reject',
      summary: 'Keep the current copy',
      deadline: '2026-10-22T12:00:00.000Z',
      declared: true,
    });
    expect(second?.decisionDefault).toBeNull();
  });
});

describe('stage latency', () => {
  const summary = {
    at: '2026-10-20T21:54:23.984Z',
    stagesTotal: 31,
    stagesWithData: 14,
    regressions: [
      'remediation:classified.p95',
      'release:staging->verified.p95',
    ],
    slowestP95: [
      { stage: 'remediation:classified', p50: 3219, p95: 201933, n: 126 },
      { stage: 'shipping:pr-open', p50: 495, p95: 15147, n: 570 },
      { stage: 'shipping:ready', p50: null, p95: 23458, n: 571 },
    ],
  };

  it('labels stages for people, keeping acronyms', () => {
    expect(stageLabel('shipping:pr-open')).toBe('Shipping · PR Open');
    expect(stageLabel('release:staging->verified')).toBe(
      'Release · Staging → Verified'
    );
  });

  it('formats the slowest stages, flags regressions, and lists the rest', () => {
    const latency = buildStageLatency(summary, 2);
    expect(latency?.rows).toEqual([
      {
        id: 'remediation:classified',
        label: 'Remediation · Classified',
        p50: '54m',
        p95: '2.3d',
        samples: 126,
        regressed: true,
      },
      {
        id: 'shipping:pr-open',
        label: 'Shipping · PR Open',
        p50: '8m',
        p95: '4.2h',
        samples: 570,
        regressed: false,
      },
    ]);
    expect(latency?.otherRegressions).toEqual(['Release · Staging → Verified']);
    expect(latency?.coverage).toBe('14 of 31 stages measured');
  });

  it('keeps unknown durations unknown and returns null without a summary', () => {
    expect(buildStageLatency(summary)?.rows[2]?.p50).toBe(OVIE_NOT_MEASURED);
    expect(buildStageLatency(null)).toBeNull();
    expect(
      buildStageLatency({ ...summary, stagesTotal: null })?.coverage
    ).toBeNull();
  });
});

describe('mergeDoneWithRecent', () => {
  it('adds merged PRs no task names, after task items, capped', () => {
    const done = [
      {
        id: 'linear:JOV-2',
        label: 'Task 2 · #22002',
        url: null,
        verified: true,
      },
    ];
    const recent = [
      {
        repo: 'Jovie',
        number: 22002,
        title: 'Task 2',
        url: 'https://github.com/JovieInc/Jovie/pull/22002',
        mergedAt: '2026-10-20T19:00:00.000Z',
      },
      {
        repo: 'Jovie',
        number: 22010,
        title: 'Fix the queue',
        url: 'https://github.com/JovieInc/Jovie/pull/22010',
        mergedAt: '2026-10-20T18:00:00.000Z',
      },
    ];
    expect(mergeDoneWithRecent(done, recent)).toEqual([
      done[0],
      {
        id: 'pr:Jovie#22010',
        label: 'Fix the queue · #22010',
        url: 'https://github.com/JovieInc/Jovie/pull/22010',
        verified: false,
      },
    ]);
    expect(mergeDoneWithRecent([], recent, 1)).toHaveLength(1);
  });
});
