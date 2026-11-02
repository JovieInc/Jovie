import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateAcquisitionEligibility,
  REVENUE_CONE_REQUIREMENTS,
  unknownAcquisitionEligibility,
} from '@/lib/acquisition/eligibility';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  eligibility: vi.fn(),
  cache: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: hoisted.eligibility,
}));
vi.mock('@/lib/ovie/company-state.server', () => ({
  readCompanyStateCache: hoisted.cache,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const route = await import(
  '@/app/api/internal/ovie/summer-company/acquisition-eligibility/route'
);

const URL =
  'https://jov.ie/api/internal/ovie/summer-company/acquisition-eligibility';
const commerce = {
  contract: 'jovie.commerce-decision-projection/v1',
  matrixRevision: 'matrix-r7',
  evaluatedAt: '2026-10-14T18:00:00.000Z',
  acquisitionOffer: 'artist-visibility-offer-contract-v1',
  eligible: false,
  matrix: [
    {
      offer: 'artist-visibility-offer-contract-v1',
      channel: 'agent-handoff',
      rail: 'ordinary-web-checkout',
      accessState: 'supported',
      merchantOfRecord: 'jovie',
      evidence: [
        'selected-rail',
        'jov-6258-preflight',
        'handoff-correlation',
        'payment-journey',
        'reversal',
      ].map(kind => ({
        kind,
        status: 'green',
        observedAt: '2026-10-14T17:00:00.000Z',
        freshnessBudgetMs: 86_400_000,
      })),
      decisionRevision: 'decision-r4',
      canary: {
        readiness: 'ready',
        result: 'not-run',
        observedAt: null,
        freshnessBudgetMs: 86_400_000,
      },
      nextReevaluationTrigger: 'policy-access-price-or-geography-change',
      status: 'supported',
      blockers: ['canary_not_run'],
      eligible: false,
    },
  ],
};

describe('GET /api/internal/ovie/summer-company/acquisition-eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T18:00:00.000Z'));
    hoisted.verify.mockResolvedValue(true);
  });

  afterEach(() => vi.useRealTimers());

  it('returns 401 without probing when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(401);
    expect(hoisted.eligibility).not.toHaveBeenCalled();
    expect(hoisted.cache).not.toHaveBeenCalled();
  });

  it('uses company state without probing providers for an ordinary read', async () => {
    hoisted.cache.mockResolvedValue({
      snapshot: {
        sourcePayloads: {
          acquisitionEligibility: {
            ...unknownAcquisitionEligibility(
              new Date(),
              'No observed evidence'
            ),
            funnel: null,
            commerce,
          },
        },
      },
    });
    const response = await route.GET(new Request(URL));
    await expect(response.json()).resolves.toMatchObject({
      eligible: false,
      commerce: {
        matrix: [
          {
            offer: 'artist-visibility-offer-contract-v1',
            channel: 'agent-handoff',
            rail: 'ordinary-web-checkout',
            accessState: 'supported',
            merchantOfRecord: 'jovie',
            evidence: [
              {
                kind: 'selected-rail',
                status: 'green',
                observedAt: '2026-10-14T17:00:00.000Z',
              },
              { kind: 'jov-6258-preflight' },
              { kind: 'handoff-correlation' },
              { kind: 'payment-journey' },
              { kind: 'reversal' },
            ],
            decisionRevision: 'decision-r4',
            canary: { readiness: 'ready', result: 'not-run' },
            nextReevaluationTrigger: 'policy-access-price-or-geography-change',
          },
        ],
      },
    });
    expect(hoisted.eligibility).not.toHaveBeenCalled();
  });

  it('keeps a complete fresh eligible snapshot eligible without probing', async () => {
    const now = new Date();
    const sources: Record<string, string[]> = {
      entry: ['m2-revenue-path:live#signed_out'],
      auth_signup: ['canary:auth-signup-onboarding'],
      claim: ['m2-revenue-path:live#claim'],
      profile_truth: [
        'canary:public-profile',
        'github:m2-revenue-path-canary.yml@main',
      ],
      offer_checkout: ['m2-revenue-path:live#pro_checkout_199'],
      activation: ['m2-revenue-path:live#activation'],
      payment_entitlement: ['github:ci.yml#Golden Path (manual)@main'],
      instrumentation: ['founder-funnel:30d'],
    };
    const eligibility = evaluateAcquisitionEligibility({
      now,
      evidence: REVENUE_CONE_REQUIREMENTS.flatMap(requirement =>
        (sources[requirement.id] ?? [`commerce:${requirement.id}`]).map(
          source => ({
            requirement: requirement.id,
            source,
            status: 'green',
            observedAt: now.toISOString(),
            maxAgeMs: 15 * 60_000,
            ref: null,
            detail: 'controlled receipt',
          })
        )
      ),
    });
    const freshCommerce = {
      ...commerce,
      eligible: true,
      matrix: commerce.matrix.map(decision => ({
        ...decision,
        eligible: true,
        status: 'passed-canary',
        blockers: [],
        canary: {
          ...decision.canary,
          result: 'passed',
          observedAt: now.toISOString(),
        },
      })),
    };
    hoisted.cache.mockResolvedValue({
      snapshot: {
        sourcePayloads: {
          acquisitionEligibility: {
            ...eligibility,
            commerce: freshCommerce,
            funnel: null,
          },
        },
      },
    });
    const response = await route.GET(new Request(URL));
    await expect(response.json()).resolves.toMatchObject({
      eligible: true,
      verdict: 'ELIGIBLE',
      commerce: { eligible: true },
    });
    expect(hoisted.eligibility).not.toHaveBeenCalled();
  });

  it('returns the predicate uncached and honors fresh=1', async () => {
    const held = {
      ...unknownAcquisitionEligibility(new Date(), 'No observed evidence'),
      funnel: null,
      commerce,
    };
    hoisted.eligibility.mockResolvedValue(held);
    const response = await route.GET(new Request(`${URL}?fresh=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      eligible: false,
      verdict: 'UNKNOWN',
      commerce: { eligible: false },
    });
    expect(hoisted.eligibility).toHaveBeenCalledWith({ fresh: true });
  });

  it('never serves a stale eligible snapshot to Summer when the producer stops', async () => {
    const observedAt = new Date('2026-10-14T18:00:00.000Z');
    const eligibility = evaluateAcquisitionEligibility({
      now: observedAt,
      evidence: REVENUE_CONE_REQUIREMENTS.map(requirement => ({
        requirement: requirement.id,
        source: `test:${requirement.id}`,
        status: 'green',
        observedAt: observedAt.toISOString(),
        maxAgeMs: 15 * 60_000,
        ref: null,
        detail: 'known controlled outcome',
      })),
    });
    expect(eligibility.eligible).toBe(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(observedAt.getTime() + 16 * 60_000));
    hoisted.cache.mockResolvedValue({
      snapshot: {
        sourcePayloads: {
          acquisitionEligibility: { ...eligibility, commerce, funnel: null },
        },
      },
    });
    const response = await route.GET(new Request(URL));
    const body = await response.json();
    expect(body.eligible).toBe(false);
    expect(body.policy.outboundAcquisition).toBe('blocked');
    expect(hoisted.eligibility).not.toHaveBeenCalled();
  });

  it('rejects a pre-commerce company-state cache entry', async () => {
    hoisted.cache.mockResolvedValue({
      snapshot: {
        sourcePayloads: {
          acquisitionEligibility: { eligible: true, verdict: 'ELIGIBLE' },
        },
      },
    });
    const response = await route.GET(new Request(URL));
    await expect(response.json()).resolves.toMatchObject({
      eligible: false,
      verdict: 'UNKNOWN',
      commerce: {
        eligible: false,
        matrix: [
          {
            accessState: 'unknown',
            canary: { readiness: 'blocked', result: 'not-run' },
          },
        ],
      },
    });
  });

  it('fails closed with an UNKNOWN verdict instead of an error', async () => {
    hoisted.cache.mockRejectedValue(new Error('boom'));
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      eligible: false,
      verdict: 'UNKNOWN',
      policy: { outboundAcquisition: 'blocked' },
      funnel: null,
    });
    expect(hoisted.captureError).toHaveBeenCalledTimes(1);
  });
});
