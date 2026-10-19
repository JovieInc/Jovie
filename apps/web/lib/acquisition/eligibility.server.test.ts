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
vi.mock('@/lib/http/server-fetch', () => ({ serverFetch: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  env: { HUD_GITHUB_OWNER: 'JovieInc', HUD_GITHUB_REPO: 'Jovie' },
}));

import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import type { M2RevenuePathReceipt } from '@/lib/canaries/m2-revenue-path';
import type { CanaryReport } from '@/lib/canaries/public-profile';
import { resolveHudGithubToken } from '@/lib/github/hud-token.server';
import { serverFetch } from '@/lib/http/server-fetch';
import type { CommerceDecisionSource } from './commerce-decision';
import {
  type AcquisitionEligibilityDeps,
  CONE_WORKFLOWS,
  computeAcquisitionEligibility,
  defaultAcquisitionEligibilityDeps,
  getAcquisitionEligibility,
  jobConclusion,
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

function commerce(): CommerceDecisionSource {
  const receipt = () => ({
    status: 'green' as const,
    observedAt: RECENT,
    maxAgeMs: 24 * 60 * 60_000,
  });
  return {
    matrixRevision: 'matrix-r7',
    decisions: [
      {
        offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'supported',
        merchantOfRecord: 'jovie',
        evidence: {
          selectedRail: receipt(),
          jov6258Preflight: receipt(),
          handoffCorrelation: receipt(),
          paymentJourney: receipt(),
          reversal: receipt(),
        },
        decisionRevision: 'decision-r4',
        canary: {
          result: 'passed',
          observedAt: RECENT,
          maxAgeMs: 24 * 60 * 60_000,
        },
        nextReevaluationTrigger: 'policy-access-price-or-geography-change',
      },
    ],
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
    readCommerceDecision: async () => commerce(),
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

  it('blocks acquisition on a reconciled rail even when the old canary and other evidence remain green', async () => {
    const input = commerce();
    input.reconciliations = [
      {
        schema: 'jovie.capability-backlog-reconciliation/v1',
        status: 'ready',
        commerceInvalidations: [
          {
            offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
            channel: 'agent-handoff',
            rail: 'ordinary-web-checkout',
            priorDecision: 'commerce-web-checkout',
            decisionRevision: 'decision-r4',
            invalidatingEvidence: 'evidence:openai-eligibility-change',
            sourceEventId: 'capability-event:commerce-change',
            matrixEvidenceDigest: 'a'.repeat(64),
            accountAccessReceiptDigest: 'b'.repeat(64),
            reasons: ['eligibility-changed'],
            nextReevaluationTrigger:
              'eligibility-restored-and-canary-recertified',
            state: 'blocked',
            canary: 'invalidated',
          },
        ],
      },
    ];
    const result = await computeAcquisitionEligibility(
      deps({ readCommerceDecision: async () => input })
    );
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockers.map(item => item.id)).toEqual([
      'selected_rail',
      'commerce_canary',
    ]);
    expect(result.commerce.matrix[0].invalidations[0].priorDecision).toBe(
      'commerce-web-checkout'
    );
  });

  it('maps a failing live M2 step to its cone requirement', async () => {
    const result = await computeAcquisitionEligibility(
      deps({
        runRevenuePathCanary: async () => m2Receipt(['pro_checkout_199']),
      })
    );
    expect(result.verdict).toBe('BLOCKED');
    expect(result.firstBlocker?.id).toBe('offer_checkout');
    expect(result.firstBlocker?.explanation).toContain('Step failed.');
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
    expect(result.firstBlocker?.evidence[0]?.ref).toBeNull();
  });

  it.each([
    ['selectedRail', 'selected_rail'],
    ['jov6258Preflight', 'jov6258_preflight'],
    ['handoffCorrelation', 'handoff_correlation'],
    ['paymentJourney', 'payment_journey'],
    ['reversal', 'reversal'],
  ] as const)(
    'fails closed when commerce %s evidence is missing',
    async (key, requirement) => {
      const input = commerce();
      input.decisions[0].evidence[key] = {
        status: 'unknown',
        observedAt: null,
        maxAgeMs: 24 * 60 * 60_000,
      };
      const result = await computeAcquisitionEligibility(
        deps({ readCommerceDecision: async () => input })
      );
      expect(result.eligible).toBe(false);
      expect(result.blockers.map(item => item.id)).toContain(requirement);
      expect(result.commerce.eligible).toBe(false);
    }
  );

  it('fails closed without leaking a commerce reader error', async () => {
    const result = await computeAcquisitionEligibility(
      deps({
        readCommerceDecision: async () => {
          throw new Error('provider-credential customer@example.com');
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.firstBlocker?.id).toBe('selected_rail');
    expect(JSON.stringify(result)).not.toContain('provider-credential');
    expect(JSON.stringify(result)).not.toContain('customer@example.com');
  });

  it('redacts raw canary, workflow and funnel diagnostics', async () => {
    const revenueBase = m2Receipt(['claim']);
    const revenue = {
      ...revenueBase,
      steps: revenueBase.steps.map((step, index) =>
        index === 1
          ? { ...step, detail: 'pi_reusable customer@example.com' }
          : step
      ),
    };
    const authBase = canary(false);
    const auth = {
      ...authBase,
      checks: authBase.checks.map(check => ({
        ...check,
        detail: '4242424242424242',
      })),
    };
    const result = await computeAcquisitionEligibility(
      deps({
        runRevenuePathCanary: async () => revenue,
        readAuthSignupCanary: async () => auth,
        readWorkflowRun: async () => ({
          status: 'observed',
          run: {
            conclusion: 'failure',
            createdAt: RECENT,
            headSha: 'secret-reusable-sha',
            url: 'https://github.com/run/cs_reusable',
          },
        }),
        readFunnel: async () =>
          funnel(['provider-credential customer@example.com']),
      })
    );
    const serialized = JSON.stringify(result);
    for (const secret of [
      'pi_reusable',
      'customer@example.com',
      '4242424242424242',
      'secret-reusable-sha',
      'cs_reusable',
      'provider-credential',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(result.funnel?.errors).toEqual(['Funnel source reported errors.']);
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
    expect(red.firstBlocker?.explanation).toContain('1 of 1 checks failed.');
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

describe('Golden Path workflow evidence', () => {
  const fetchMock = vi.mocked(serverFetch);
  const json = (body: unknown, status = 200) =>
    ({
      json: async () => body,
      ok: status < 400,
      status,
    }) as unknown as Response;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(resolveHudGithubToken).mockResolvedValue('token');
  });

  it('reads the Golden Path job, not the dispatching run', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          workflow_runs: [
            {
              conclusion: 'failure',
              created_at: RECENT,
              head_sha: 'a'.repeat(40),
              html_url: 'https://github.com/run/9',
              id: 9,
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        json({
          jobs: [
            { conclusion: 'failure', name: 'Unit Tests' },
            { conclusion: 'success', name: 'Golden Path (manual)' },
          ],
        })
      );
    const read = await defaultAcquisitionEligibilityDeps.readWorkflowRun(
      CONE_WORKFLOWS.goldenPath
    );
    expect(read).toEqual({
      run: {
        conclusion: 'success',
        createdAt: RECENT,
        headSha: 'a'.repeat(40),
        url: 'https://github.com/run/9',
      },
      status: 'observed',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/actions/workflows/ci.yml/runs?branch=main&status=completed&event=workflow_dispatch&per_page=1'
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/actions/runs/9/jobs?filter=latest&per_page=100'
    );
  });

  it('keeps whole-run evidence for plain workflow files', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ workflow_runs: [{ conclusion: 'success', created_at: RECENT }] })
    );
    const read = await defaultAcquisitionEligibilityDeps.readWorkflowRun(
      CONE_WORKFLOWS.revenuePath
    );
    expect(read).toMatchObject({ run: { conclusion: 'success' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('event=');
  });

  it('reports an unreadable run or job list as unavailable', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 502));
    expect(
      await defaultAcquisitionEligibilityDeps.readWorkflowRun(
        CONE_WORKFLOWS.goldenPath
      )
    ).toEqual({ reason: 'GitHub API error (502).', status: 'unavailable' });

    fetchMock
      .mockResolvedValueOnce(
        json({ workflow_runs: [{ created_at: RECENT, id: 3 }] })
      )
      .mockResolvedValueOnce(json({}, 403));
    expect(
      await defaultAcquisitionEligibilityDeps.readWorkflowRun(
        CONE_WORKFLOWS.goldenPath
      )
    ).toEqual({ reason: 'GitHub API error (403).', status: 'unavailable' });
  });

  it('counts a skipped or missing Golden Path job as red unless cancelled', () => {
    const skipped = [{ conclusion: 'skipped', name: 'Golden Path (manual)' }];
    expect(jobConclusion(skipped, 'Golden Path (manual)', 'failure')).toBe(
      'failure'
    );
    expect(jobConclusion([], 'Golden Path (manual)', 'success')).toBe(
      'failure'
    );
    expect(jobConclusion([], 'Golden Path (manual)', 'cancelled')).toBe(
      'cancelled'
    );
  });
});
