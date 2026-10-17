import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  getSummerFunnel: vi.fn(),
}));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: vi.fn(),
}));
vi.mock('@/lib/admin/waitlist', () => ({ getWaitlistMetrics: vi.fn() }));
vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  publishConfiguredShippingState: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/founder-work', () => ({
  createLiveFounderWorkReader: () => ({ listLinearIssues: vi.fn() }),
}));

import { COMPANY_FUNNEL_STEPS } from './company-state';
import {
  readCompanyStateCache,
  readCompanyStateHistory,
} from './company-state.server';

const metric = {
  value: 2,
  status: 'green',
  observedAt: '2026-10-14T07:55:00.000Z',
  source: 'test',
  sourceRevision: 'r1',
  sourceWindow: 'rolling-7d',
  freshnessBudgetMs: 3_600_000,
  semantics: 'exact',
  confidence: 'high',
} as const;
const snapshot = {
  schema: 'jovie.summer-company-state/v1',
  revision: 'r1',
  generatedAt: metric.observedAt,
  shipping: { rollingRatePerDay: metric },
  funnel: Object.fromEntries(COMPANY_FUNNEL_STEPS.map(key => [key, metric])),
  sync: [{ provider: 'github', calls: 10 }],
  activeConstraint: 'funnel:claim_shown',
  investigations: [],
} as never;
const encoded = JSON.stringify(snapshot);

function fakeRedis() {
  return {
    get: vi.fn(async (key: string) =>
      key.endsWith(':latest') ? encoded : null
    ),
    incr: vi.fn(async () => 1),
    incrby: vi.fn(async (_key: string, amount: number) => amount),
    lrange: vi.fn(async () => [encoded, encoded]),
  };
}

describe('company-state cache reads', () => {
  it('reads Redis with zero upstream calls', async () => {
    const redis = fakeRedis();
    const result = await readCompanyStateCache({
      now: new Date('2026-10-14T08:00:00.000Z'),
      redis: redis as never,
    });
    expect(result).toMatchObject({
      answer: { throughput: 2, activeConstraint: 'funnel:claim_shown' },
      cache: {
        upstreamCallsAvoided: 10,
        readPathUpstreamCalls: 0,
      },
    });
  });

  it('returns bounded local history', async () => {
    expect(await readCompanyStateHistory(2, fakeRedis() as never)).toHaveLength(
      2
    );
  });
});
