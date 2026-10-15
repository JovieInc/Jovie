import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import type { DemandAllocationPlan } from './allocation-contract';
import {
  DEMAND_ALLOCATION_KEY,
  type DemandAllocationGate,
  governDemandAllocation,
} from './allocation-governor';

const START = '2026-10-15T12:00:00.000Z';
function plan(
  id = 'bet-1',
  overrides: Partial<DemandAllocationPlan> = {}
): DemandAllocationPlan {
  return {
    id,
    kind: 'implementation',
    context: {},
    authorization: {
      ref: 'delegation:bounded-reversible-research-and-code',
      lowRisk: true,
      effortMinutes: 30,
      validUntil: '2026-11-01T00:00:00.000Z',
    },
    prediction: {
      metrics: { activationCount: 3, costCents: 100 },
      sourceRef: 'baseline:funnel',
      reviewAfterHours: 24,
    },
    observations: Array.from({ length: 6 }, (_, i) => ({
      observedAt: START,
      surface: 'cli',
      request: `request variant ${i}`,
      capability: 'release-insights',
      job: 'understand-release',
      icpAdjacent: true,
      provenance: { kind: 'external-customer', sourceKey: `customer-${i}` },
    })),
    ...overrides,
  };
}
function harness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: async key => records.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
  };
  let now = new Date(START);
  const send = (command: unknown, gate: Partial<DemandAllocationGate> = {}) =>
    governDemandAllocation({
      backend,
      command,
      now,
      gate: {
        status: 'green',
        evaluatedAt: now.toISOString(),
        ref: 'cone:current',
        ...gate,
      },
    });
  return {
    backend,
    records,
    send,
    advance: (hours: number) => {
      now = new Date(now.getTime() + hours * 3_600_000);
    },
  };
}
const last = (
  ledger: Awaited<ReturnType<typeof governDemandAllocation>>,
  index = 0
) => ledger.rows[index].decisions.at(-1);
async function execute(h: ReturnType<typeof harness>, id = 'bet-1') {
  await h.send({ op: 'submit', plan: plan(id) });
  await h.send({ op: 'claim', id, worker: 'summer-worker' });
  return h.send({
    op: 'complete',
    id,
    worker: 'summer-worker',
    executionRef: `runtime:${id}`,
  });
}
function review(id = 'bet-1', receiptId = 'review-1') {
  return {
    op: 'review',
    id,
    receiptId,
    supersedes: null,
    windowStartedAt: START,
    windowEndedAt: '2026-10-16T12:00:00.000Z',
    metrics: { activationCount: 0, costCents: 150 },
    evidenceRefs: ['funnel:dogfood-excluded', 'cost:receipt'],
  };
}

describe('demand allocation governor', () => {
  it('holds an attractive feature under RED, releases it on GREEN and rechecks at claim', async () => {
    const h = harness();
    const held = await h.send(
      { op: 'submit', plan: plan() },
      { status: 'red' }
    );
    expect(last(held)).toMatchObject({
      state: 'held',
      reason: 'cone-repair-first:cone:current',
    });
    expect(last(held)?.score).toBeGreaterThan(40);
    expect(last(await h.send({ op: 'reconcile' }))).toMatchObject({
      state: 'ready',
    });
    await expect(
      h.send({ op: 'claim', id: 'bet-1', worker: 'worker' }, { status: 'red' })
    ).rejects.toThrow('allocation-not-ready');
    const started = await h.send({
      op: 'claim',
      id: 'bet-1',
      worker: 'worker',
    });
    expect(started.rows[0].execution).toMatchObject({
      worker: 'worker',
      productionAuthorized: false,
      reviewDueAt: '2026-10-16T12:00:00.000Z',
    });
    expect(started.rows[0].decisions.map(d => d.state)).toEqual([
      'held',
      'ready',
      'executing',
    ]);
  });

  it.each(['unknown', 'green'] as const)(
    'fails closed on %s cone evidence that cannot authorize expansion',
    async status => {
      const h = harness();
      expect(
        last(
          await h.send(
            { op: 'submit', plan: plan() },
            { status, evaluatedAt: '2026-10-14T00:00:00.000Z' }
          )
        )?.state
      ).toBe('held');
      expect(
        last(await h.send({ op: 'reconcile' }, { evaluatedAt: 'invalid' }))
          ?.state
      ).toBe('held');
      expect(
        last(
          await h.send(
            { op: 'reconcile' },
            { evaluatedAt: '2026-10-16T00:00:00.000Z' }
          )
        )?.state
      ).toBe('held');
    }
  );

  it.each(['repair', 'certification', 'unblocking'] as const)(
    'permits authorized %s while the cone is RED',
    async kind => {
      const h = harness();
      expect(
        last(
          await h.send(
            { op: 'submit', plan: plan('repair', { kind }) },
            { status: 'red' }
          )
        )?.state
      ).toBe('ready');
      expect(
        last(
          await h.send(
            { op: 'claim', id: 'repair', worker: 'worker' },
            { status: 'red' }
          )
        )?.state
      ).toBe('executing');
    }
  );

  it.each(['outbound', 'spend'] as const)(
    'keeps %s human-gated despite GREEN and automatic authorization',
    async kind => {
      const h = harness();
      expect(
        last(await h.send({ op: 'submit', plan: plan('bet-1', { kind }) }))
          ?.state
      ).toBe('escalated');
      await expect(
        h.send({ op: 'claim', id: 'bet-1', worker: 'worker' })
      ).rejects.toThrow('allocation-not-ready');
    }
  );

  it('respects cluster human gates, ambiguous tradeoffs, low risk and expired authorizations', async () => {
    for (const candidate of [
      plan('gate', {
        observations: plan().observations.map(item => ({
          ...item,
          requiresHumanGate: true,
        })),
      }),
      plan('ambiguous', {
        context: { implementationCost: 0.9, fragmentationRisk: 0.5 },
      }),
      plan('risk', {
        authorization: { ...plan().authorization, lowRisk: false },
      }),
    ]) {
      expect(
        last(await harness().send({ op: 'submit', plan: candidate }))?.state
      ).toBe('escalated');
    }
    const h = harness();
    expect(
      last(
        await h.send({
          op: 'submit',
          plan: plan('expired', {
            authorization: { ...plan().authorization, validUntil: START },
          }),
        })
      )?.reason
    ).toBe('authorization-expired');
  });

  it('permits low-risk research for an investigate disposition without founder involvement', async () => {
    const h = harness();
    const candidate = plan('research', {
      kind: 'research',
      observations: plan().observations.slice(0, 1),
    });
    const result = await h.send({ op: 'submit', plan: candidate });
    expect(last(result)).toMatchObject({
      state: 'ready',
      disposition: 'investigate',
    });
    expect(
      last(await h.send({ op: 'claim', id: 'research', worker: 'worker' }))
        ?.state
    ).toBe('executing');
    expect(
      last(
        await harness().send({
          op: 'submit',
          plan: { ...candidate, kind: 'implementation' },
        })
      )?.state
    ).toBe('held');
  });

  it('holds ICP expansion until measured customer evidence justifies a bounded test', async () => {
    const candidate = plan('new-icp', {
      observations: plan().observations.map(item => ({
        ...item,
        icpAdjacent: false,
      })),
      context: { jobImportance: 1, graphLeverage: 1 },
    });
    expect(
      last(await harness().send({ op: 'submit', plan: candidate }))?.reason
    ).toBe('musician-icp-until-measured-test-evidence');
    expect(
      last(
        await harness().send({
          op: 'submit',
          plan: {
            ...candidate,
            icpTestEvidence: {
              ref: 'measured:outside-icp',
              independentCustomers: 3,
              observedAt: START,
            },
          },
        })
      )?.state
    ).toBe('ready');
  });

  it('persists prediction, execution, review window, observed zeros and prediction deltas across restarts', async () => {
    const h = harness();
    await execute(h);
    await expect(h.send(review())).rejects.toThrow('outcome-window-not-mature');
    h.advance(24);
    const result = await h.send(review());
    expect(result.rows[0].reviews[0]).toMatchObject({
      verdict: 'missed',
      differences: [
        {
          metric: 'activationCount',
          predicted: 3,
          actual: 0,
          delta: -3,
          met: false,
        },
        {
          metric: 'costCents',
          predicted: 100,
          actual: 150,
          delta: 50,
          met: false,
        },
      ],
    });
    expect(JSON.parse(String(h.records.get(DEMAND_ALLOCATION_KEY)))).toEqual(
      result
    );
    const restarted = await governDemandAllocation({
      backend: h.backend,
      command: { op: 'reconcile' },
      now: new Date('2026-10-16T12:00:00.000Z'),
      gate: { status: 'red', evaluatedAt: START, ref: 'cone:blocked' },
    });
    expect(restarted.rows[0].plan.prediction).toEqual(plan().prediction);
    expect(restarted.rows[0].execution?.ref).toBe('runtime:bet-1');
    expect(restarted.rows[0].reviews).toEqual(result.rows[0].reviews);
  });

  it('records missing measurements as inconclusive, supports immutable correction chains, then releases capacity', async () => {
    const h = harness();
    await execute(h);
    h.advance(24);
    const incomplete = { ...review(), metrics: { activationCount: 3 } };
    expect((await h.send(incomplete)).rows[0].reviews[0].verdict).toBe(
      'inconclusive'
    );
    expect(
      last(await h.send({ op: 'submit', plan: plan('next') }), 1)?.reason
    ).toBe('outcome-review-pending');
    const correction = {
      ...review(),
      receiptId: 'review-2',
      supersedes: 'review-1',
      metrics: { activationCount: 3, costCents: 10 },
    };
    const corrected = await h.send(correction);
    expect(corrected.rows[0].reviews.map(item => item.verdict)).toEqual([
      'inconclusive',
      'validated',
    ]);
    expect(last(corrected, 1)?.state).toBe('ready');
    expect(await h.send(correction)).toEqual(corrected);
    await expect(
      h.send({ ...correction, metrics: { activationCount: 5 } })
    ).rejects.toThrow('outcome-receipt-conflict');
    await expect(
      h.send({ ...correction, receiptId: 'review-3', supersedes: null })
    ).rejects.toThrow('outcome-revision-conflict');
  });

  it('feeds repeated mature misses into the next score without penalizing unrelated jobs', async () => {
    const h = harness();
    const initial = await h.send({ op: 'submit', plan: plan() });
    const baseline = last(initial)?.score ?? 0;
    for (let i = 1; i <= 2; i++) {
      const id = `bet-${i}`;
      await execute(h, id);
      h.advance(24);
      await h.send({
        ...review(id, `review-${i}`),
        windowStartedAt: new Date(
          Date.parse(START) + (i - 1) * 24 * 3_600_000
        ).toISOString(),
        windowEndedAt: new Date(
          Date.parse(START) + i * 24 * 3_600_000
        ).toISOString(),
      });
    }
    const next = await h.send({ op: 'submit', plan: plan('next') });
    expect(last(next, 2)?.score).toBe(baseline - 20);
    expect(last(next, 2)?.outcomePenalty).toBe(2 / 3);
    const unrelated = plan('other', {
      observations: plan().observations.map(item => ({
        ...item,
        job: 'different-job',
      })),
    });
    expect(
      last(await h.send({ op: 'submit', plan: unrelated }), 3)?.score
    ).toBe(baseline);
  });

  it('serializes concurrent claims and rejects duplicate IDs with changed scope', async () => {
    const h = harness();
    await h.send({ op: 'submit', plan: plan() });
    await h.send({ op: 'submit', plan: plan('other') });
    const claims = await Promise.allSettled(
      ['bet-1', 'other'].map(id =>
        h.send({ op: 'claim', id, worker: 'worker' })
      )
    );
    expect(claims.filter(result => result.status === 'fulfilled')).toHaveLength(
      1
    );
    expect(claims.filter(result => result.status === 'rejected')).toHaveLength(
      1
    );
    const result = await h.send({ op: 'reconcile' });
    expect(last(result, 1)?.reason).toBe('execution-capacity-full');
    expect(
      await h.send({ op: 'claim', id: 'bet-1', worker: 'worker' })
    ).toEqual(result);
    await expect(
      h.send({ op: 'claim', id: 'bet-1', worker: 'different-worker' })
    ).rejects.toThrow('already-claimed');
    await expect(
      h.send({ op: 'submit', plan: plan('bet-1', { kind: 'research' }) })
    ).rejects.toThrow('allocation-id-conflict');
  });

  it('rejects outcomes before execution, crossed windows, receipt conflicts and invalid metrics', async () => {
    const h = harness();
    await h.send({ op: 'submit', plan: plan() });
    await expect(h.send(review())).rejects.toThrow('outcome-before-execution');
    await expect(
      h.send({
        op: 'complete',
        id: 'bet-1',
        worker: 'worker',
        executionRef: 'runtime',
      })
    ).rejects.toThrow('execution-owner-mismatch');
    await execute(h);
    h.advance(24);
    await expect(
      h.send({ ...review(), windowStartedAt: '2026-10-14T00:00:00.000Z' })
    ).rejects.toThrow('outcome-window-not-mature');
    await expect(
      h.send({ ...review(), metrics: { usageCount: -1 } })
    ).rejects.toThrow();
    await expect(
      h.send({
        op: 'complete',
        id: 'bet-1',
        worker: 'summer-worker',
        executionRef: 'different',
      })
    ).rejects.toThrow('execution-receipt-conflict');
  });

  it('rejects future demand, mixed clusters, empty predictions and unknown allocations', async () => {
    const h = harness();
    await expect(
      h.send({
        op: 'submit',
        plan: plan('future', {
          observations: plan().observations.map(item => ({
            ...item,
            observedAt: '2026-11-01T00:00:00.000Z',
          })),
        }),
      })
    ).rejects.toThrow('future-demand-evidence');
    const mixed = plan();
    mixed.observations[0] = { ...mixed.observations[0], job: 'another-job' };
    await expect(h.send({ op: 'submit', plan: mixed })).rejects.toThrow(
      'one-cluster-per-allocation'
    );
    await expect(
      h.send({
        op: 'submit',
        plan: plan('empty', {
          prediction: { ...plan().prediction, metrics: {} },
        }),
      })
    ).rejects.toThrow('prediction-needs-metrics');
    await expect(
      h.send({ op: 'claim', id: 'missing', worker: 'worker' })
    ).rejects.toThrow('allocation-not-found');
    await expect(
      governDemandAllocation({
        backend: h.backend,
        command: { op: 'reconcile' },
        gate: { status: 'green', ref: 'cone', evaluatedAt: START },
        now: new Date('invalid'),
      })
    ).rejects.toThrow('invalid-clock');
  });

  it('records every available outcome channel and treats maintenance as a ceiling', async () => {
    const h = harness();
    const metrics = {
      activationCount: 1,
      claimCount: 1,
      costCents: 100,
      graphExpansionCount: 1,
      maintenanceMinutes: 10,
      qualityScore: 0.8,
      repeatUsageCount: 1,
      retentionCount: 1,
      revenueCents: 19900,
      usageCount: 1,
    };
    await h.send({
      op: 'submit',
      plan: plan('all', { prediction: { ...plan().prediction, metrics } }),
    });
    await h.send({ op: 'claim', id: 'all', worker: 'worker' });
    const complete = {
      op: 'complete',
      id: 'all',
      worker: 'worker',
      executionRef: 'runtime:all',
    };
    const executed = await h.send(complete);
    expect(await h.send(complete)).toEqual(executed);
    h.advance(24);
    const result = await h.send({
      ...review('all'),
      metrics: { ...metrics, maintenanceMinutes: 11 },
    });
    expect(result.rows[0].reviews[0]).toMatchObject({
      verdict: 'missed',
      metrics: { revenueCents: 19900, qualityScore: 0.8 },
    });
    expect(
      result.rows[0].reviews[0].differences.find(
        item => item.metric === 'maintenanceMinutes'
      )
    ).toMatchObject({ delta: 1, met: false });
  });

  it('fails closed on corrupt persistence and exhausted CAS retries', async () => {
    const h = harness();
    h.records.set(DEMAND_ALLOCATION_KEY, '{bad json');
    await expect(h.send({ op: 'reconcile' })).rejects.toThrow();
    h.records.delete(DEMAND_ALLOCATION_KEY);
    await h.send({ op: 'submit', plan: plan() });
    h.backend.compareAndSet = async () => false;
    await expect(
      h.send({ op: 'claim', id: 'bet-1', worker: 'worker' })
    ).rejects.toThrow('lost compare-and-set');
    expect(
      JSON.parse(String(h.records.get(DEMAND_ALLOCATION_KEY))).rows[0].execution
    ).toBeNull();
  });
});
