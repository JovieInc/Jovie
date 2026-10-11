import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  eligibility: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: hoisted.eligibility,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const route = await import(
  '@/app/api/internal/ovie/summer-company/acquisition-eligibility/route'
);

const URL =
  'https://jov.ie/api/internal/ovie/summer-company/acquisition-eligibility';

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
  });

  it('returns the predicate uncached and honors fresh=1', async () => {
    hoisted.eligibility.mockResolvedValue({
      eligible: false,
      verdict: 'BLOCKED',
    });
    const response = await route.GET(new Request(`${URL}?fresh=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      eligible: false,
      verdict: 'BLOCKED',
    });
    expect(hoisted.eligibility).toHaveBeenCalledWith({ fresh: true });
  });

  it('fails closed with an UNKNOWN verdict instead of an error', async () => {
    hoisted.eligibility.mockRejectedValue(new Error('boom'));
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
