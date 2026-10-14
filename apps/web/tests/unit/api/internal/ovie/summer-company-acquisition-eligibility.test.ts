import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    hoisted.verify.mockResolvedValue(true);
  });

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
            eligible: false,
            verdict: 'UNKNOWN',
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

  it('returns the predicate uncached and honors fresh=1', async () => {
    hoisted.eligibility.mockResolvedValue({
      eligible: false,
      verdict: 'BLOCKED',
      commerce,
    });
    const response = await route.GET(new Request(`${URL}?fresh=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      eligible: false,
      verdict: 'BLOCKED',
      commerce,
    });
    expect(hoisted.eligibility).toHaveBeenCalledWith({ fresh: true });
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
