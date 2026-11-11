import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Baseline-funnel persistence tests (JOV-6468 acceptance criterion 1). */

type Row = Record<string, unknown>;

const dbMock = vi.hoisted(() => {
  const state = {
    queue: [] as Array<() => Row[]>,
    insertCalls: [] as Array<{ table: string; values: Row }>,
  };
  type Chain = {
    from: () => Chain;
    where: () => Chain;
    orderBy: () => Chain;
    limit: () => Chain;
    values: (v: Row) => Chain;
    onConflictDoNothing: () => Chain;
    returning: () => Promise<Row[]>;
    then: (
      res: (v: Row[]) => void,
      rej?: (e: unknown) => void
    ) => Promise<void>;
  };
  const awaitable = (): Chain => {
    const settle = () => {
      const producer = state.queue.shift();
      if (!producer) throw new Error('test db queue empty');
      return producer();
    };
    const c = {} as Chain;
    c.from = () => c;
    c.where = () => c;
    c.orderBy = () => c;
    c.limit = () => c;
    c.onConflictDoNothing = () => c;
    c.returning = () => Promise.resolve(settle());
    c.then = (res, rej) => Promise.resolve(settle()).then(res, rej);
    return c;
  };
  const db = {
    select: () => awaitable(),
    insert: (table: Record<string | symbol, unknown>) => {
      const table_ = String(table?.[Symbol.for('drizzle:Name')] ?? 'unknown');
      const insertChain = awaitable();
      return Object.assign(insertChain, {
        values: (values: Row) => {
          state.insertCalls.push({ table: table_, values });
          return insertChain;
        },
      });
    },
  };
  return { state, db };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: dbMock.db }));

vi.mock('@/lib/acquisition/proof-claim-funnel.server', () => ({
  getProofClaimFunnelReport: vi.fn(),
  readProofClaimCounters: vi.fn(),
}));
vi.mock('@/lib/acquisition/proof-claim-funnel', () => ({
  PROOF_CLAIM_FUNNEL_EVENTS: {
    PROOF_VIEWED: 'proof_viewed',
    CLAIM_STARTED: 'claim_started',
    CHECKOUT: 'checkout',
    ACTIVATION: 'activation',
  },
}));

import { captureProofClaimBaseline } from './pilot-baseline.server';
import { ACTIVATION_PILOT_SPEC } from './pilot-controller';

const { state: dbQueue } = dbMock;

beforeEach(() => {
  dbQueue.queue = [];
  dbQueue.insertCalls = [];
});

describe('captureProofClaimBaseline', () => {
  it('records the real funnel with chained denominators and fresh sources', async () => {
    const { getProofClaimFunnelReport, readProofClaimCounters } = await import(
      '@/lib/acquisition/proof-claim-funnel.server'
    );
    vi.mocked(getProofClaimFunnelReport).mockResolvedValue({
      campaignKey: 'proof-to-claim',
      variantKey: 'proof-to-claim:m1:v1',
      stages: {
        proofViewed: 500,
        claimStarted: 40,
        checkout: 12,
        activation: 6,
      },
      rates: {},
    } as never);
    vi.mocked(readProofClaimCounters).mockResolvedValue({
      proof_viewed: 500,
      claim_started: 40,
      checkout: 12,
      activation: 6,
    });

    dbQueue.queue.push(() => []);
    const result = await captureProofClaimBaseline({
      spec: ACTIVATION_PILOT_SPEC,
      eligiblePopulation: 500,
      capturedAtIso: '2026-11-09T12:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    const persisted = dbQueue.insertCalls[0];
    expect(persisted.values.cohortId).toBe(ACTIVATION_PILOT_SPEC.cohort.id);
    expect(persisted.values.eligiblePopulation).toBe(500);
    const stages = persisted.values.stages as ReadonlyArray<{
      stage: string;
      count: number | null;
      denominator: number | null;
      freshness: string;
    }>;
    expect(stages.map(s => [s.stage, s.count, s.denominator])).toEqual([
      ['proof_viewed', 500, 500],
      ['claim_started', 40, 500],
      ['checkout', 12, 40],
      ['activation', 6, 12],
    ]);
    expect(stages.every(s => s.freshness === 'fresh')).toBe(true);
  });

  it('marks a zero stage with an unreadable counter source as unknown, never a confident zero', async () => {
    const { getProofClaimFunnelReport, readProofClaimCounters } = await import(
      '@/lib/acquisition/proof-claim-funnel.server'
    );
    vi.mocked(getProofClaimFunnelReport).mockResolvedValue({
      campaignKey: 'proof-to-claim',
      variantKey: 'proof-to-claim:m1:v1',
      stages: {
        proofViewed: 500,
        claimStarted: 0,
        checkout: 0,
        activation: 0,
      },
      rates: {},
    } as never);
    // Redis unreadable → empty map → zero counts are unknown, not zero.
    vi.mocked(readProofClaimCounters).mockResolvedValue({});

    dbQueue.queue.push(() => []);
    await captureProofClaimBaseline({
      spec: ACTIVATION_PILOT_SPEC,
      eligiblePopulation: null,
      capturedAtIso: '2026-11-09T12:00:00.000Z',
    });
    const persisted = dbQueue.insertCalls[0];
    expect(persisted.values.eligiblePopulation).toBeNull();
    const stages = persisted.values.stages as ReadonlyArray<{
      stage: string;
      count: number | null;
      freshness: string;
    }>;
    const claim = stages.find(s => s.stage === 'claim_started');
    expect(claim?.count).toBe(0);
    expect(claim?.freshness).toBe('unknown');
  });
});
