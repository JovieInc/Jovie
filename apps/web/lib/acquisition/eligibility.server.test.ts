import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redis: null as null | {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@/lib/redis', () => ({ getRedis: () => hoisted.redis }));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: vi.fn(),
}));
vi.mock('@/lib/admin/ops-queries', () => ({
  getAuthSignupOnboardingCanaryStatus: vi.fn(),
  getPublicProfileCanaryStatus: vi.fn(),
}));
vi.mock('@/lib/github/hud-token.server', () => ({
  resolveHudGithubToken: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import type { M2RevenuePathReceipt } from '@/lib/canaries/m2-revenue-path';
import type { CanaryReport } from '@/lib/canaries/public-profile';
import {
  type AcquisitionEligibilityDeps,
  CONE_WORKFLOWS,
  computeAcquisitionEligibility,
  getAcquisitionEligibility,
  type WorkflowRunRead,
} from './eligibility.server';

const NOW = new Date('2026-10-03T18:00:00.000Z');
const RECENT = '2026-10-03T12:00:00.000Z';

function m2Receipt(failing: readonly string[] = []): M2RevenuePathReceipt {
  return {
    canary: 'm2-revenue-path',
    distinctFrom: 'generic-uptime',
    finishedAt: NOW.toISOString(),
    issue: 'JOV-6439',
    pass: failing.length === 0,
    repro: 'pnpm m2',
    runAt: NOW.toISOString(),
    schemaVersion: 1,
    steps: (
      ['signed_out', 'claim', 'pro_checkout_199', 'activation'] as const
    ).map(name => ({
      durationMs: 1,
      evidence: [],
      finishedAt: NOW.toISOString(),
      name,
      ok: !failing.includes(name),
      startedAt: NOW.toISOString(),
      ...(failing.includes(name) ? { detail: `${name} broke` } : {}),
    })),
    target: 'https://jov.ie',
    totalDurationMs: 4,
  };
}

function canary(pass = true): CanaryReport {
  return {
    checks: [
      {
        durationMs: 1,
        name: 'check',
        ok: pass,
        detail: pass ? undefined : 'boom',
      },
    ],
    pass,
    runAt: RECENT,
    totalDurationMs: 1,
  };
}

function run(conclusion: string): WorkflowRunRead {
  return {
    run: {
      conclusion,
      createdAt: RECENT,
      headSha: 'abcdef1234567890',
      url: 'https://github.com/run/1',
    },
    status: 'observed',
  };
}

function funnel(errors: string[] = []): FounderFunnelData {
  return {
    biggestDropOffKey: 'paid',
    definitionVersion: 'founder-funnel.v2',
    errors,
    stages: [
      {
        conversionRate: null,
        count: 40,
        description: '',
        drillDownHref: null,
        dropOff: null,
        identifiable: false,
        key: 'accounts_created',
        label: 'Accounts',
      },
      {
        conversionRate: 0,
        count: 0,
        description: '',
        drillDownHref: null,
        dropOff: 40,
        identifiable: true,
        key: 'paid',
        label: 'Paid',
      },
    ],
    timeRange: '30d',
  };
}

function deps(
  overrides: Partial<AcquisitionEligibilityDeps> = {}
): AcquisitionEligibilityDeps {
  return {
    now: () => NOW,
    readAuthSignupCanary: async () => canary(),
    readFunnel: async () => funnel(),
    readPublicProfileCanary: async () => canary(),
    readWorkflowRun: async () => run('success'),
    runRevenuePathCanary: async () => m2Receipt(),
    ...overrides,
  };
}

describe('computeAcquisitionEligibility', () => {
  beforeEach(() => {
    hoisted.redis = null;
  });

  it('is eligible when every existing owner reports green', async () => {
    const result = await computeAcquisitionEligibility(deps());
    expect(result.eligible).toBe(true);
    expect(result.requirements.every(item => item.status === 'green')).toBe(
      true
    );
    expect(result.funnel).toMatchObject({
      biggestDropOffKey: 'paid',
      definitionVersion: 'founder-funnel.v2',
    });
  });

  it('maps a failing live M2 step to its cone requirement', async () => {
    const result = await computeAcquisitionEligibility(
      deps({
        runRevenuePathCanary: async () => m2Receipt(['pro_checkout_199']),
      })
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.firstBlocker?.id).toBe('offer_checkout');
    expect(result.firstBlocker?.explanation).toContain(
      'pro_checkout_199 broke'
    );
  });

  it('marks the live-probed requirements unknown when the probe throws', async () => {
    const result = await computeAcquisitionEligibility(
      deps({
        runRevenuePathCanary: async () => {
          throw new Error('network down');
        },
      })
    );
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.blockers.map(item => item.id)).toEqual([
      'entry',
      'claim',
      'offer_checkout',
      'activation',
    ]);
  });

  it('turns a failed Golden Path lane into a red payment requirement', async () => {
    const result = await computeAcquisitionEligibility(
      deps({
        readWorkflowRun: async workflow =>
          workflow === CONE_WORKFLOWS.goldenPath
            ? run('failure')
            : run('success'),
      })
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.firstBlocker?.id).toBe('payment_entitlement');
    expect(result.firstBlocker?.evidence[0]?.ref).toBe(
      'https://github.com/run/1'
    );
  });

  it('treats cancelled runs, missing runs and unreadable GitHub as unknown', async () => {
    for (const read of [
      run('cancelled'),
      { run: null, status: 'observed' } as const,
      {
        reason: 'GitHub read is not configured.',
        status: 'unavailable',
      } as const,
    ]) {
      const result = await computeAcquisitionEligibility(
        deps({ readWorkflowRun: async () => read })
      );
      expect(result.verdict).toBe('UNKNOWN');
      expect(result.firstBlocker?.id).toBe('profile_truth');
    }
  });

  it('treats an expired canary key and a red canary differently', async () => {
    const missing = await computeAcquisitionEligibility(
      deps({ readAuthSignupCanary: async () => null })
    );
    expect(missing.firstBlocker).toMatchObject({
      id: 'auth_signup',
      status: 'unknown',
    });
    const red = await computeAcquisitionEligibility(
      deps({ readAuthSignupCanary: async () => canary(false) })
    );
    expect(red.firstBlocker).toMatchObject({
      id: 'auth_signup',
      status: 'red',
    });
    expect(red.firstBlocker?.explanation).toContain('boom');
  });

  it('cannot diagnose the funnel when the funnel read is degraded', async () => {
    const result = await computeAcquisitionEligibility(
      deps({ readFunnel: async () => funnel(['db timeout']) })
    );
    expect(result.firstBlocker).toMatchObject({
      id: 'instrumentation',
      status: 'unknown',
    });
    const thrown = await computeAcquisitionEligibility(
      deps({
        readFunnel: async () => {
          throw new Error('db down');
        },
      })
    );
    expect(thrown.firstBlocker?.id).toBe('instrumentation');
    expect(thrown.funnel).toBeNull();
  });
});

describe('getAcquisitionEligibility', () => {
  beforeEach(() => {
    hoisted.redis = { get: vi.fn(), set: vi.fn() };
  });

  it('serves a cached report without re-probing', async () => {
    const cached = await computeAcquisitionEligibility(deps());
    hoisted.redis?.get.mockResolvedValue(JSON.stringify(cached));
    const runRevenuePathCanary = vi.fn();
    const result = await getAcquisitionEligibility(
      {},
      deps({ runRevenuePathCanary })
    );
    expect(result.eligible).toBe(true);
    expect(runRevenuePathCanary).not.toHaveBeenCalled();
  });

  it('recomputes and caches on a miss, a malformed entry, or fresh=1', async () => {
    hoisted.redis?.get.mockResolvedValue('{"contract":"other"}');
    const runRevenuePathCanary = vi.fn(async () => m2Receipt(['claim']));
    const result = await getAcquisitionEligibility(
      {},
      deps({ runRevenuePathCanary })
    );
    expect(result.firstBlocker?.id).toBe('claim');
    expect(hoisted.redis?.set).toHaveBeenCalledWith(
      'acquisition:eligibility:v1',
      expect.any(String),
      { ex: 600 }
    );

    await getAcquisitionEligibility(
      { fresh: true },
      deps({ runRevenuePathCanary })
    );
    expect(runRevenuePathCanary).toHaveBeenCalledTimes(2);
  });

  it('still computes when Redis reads fail', async () => {
    hoisted.redis?.get.mockRejectedValue(new Error('quota'));
    const result = await getAcquisitionEligibility({}, deps());
    expect(result.eligible).toBe(true);
  });
});
