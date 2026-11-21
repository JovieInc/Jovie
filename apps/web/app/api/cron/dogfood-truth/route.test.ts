import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  check: vi.fn(),
  capture: vi.fn(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cron/auth', () => ({ verifyCronRequest: mocks.verify }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/dogfood/account-truth', () => ({
  checkDesignPartnerAccountTruth: mocks.check,
}));

import { GET } from './route';

const request = () => new Request('http://x/api/cron/dogfood-truth');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockReturnValue(null);
});

describe('dogfood truth cron route', () => {
  it('rejects requests without the cron secret before checking', async () => {
    mocks.verify.mockReturnValue(new Response('no', { status: 401 }));
    expect((await GET(request())).status).toBe(401);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('returns the report with 200 even when findings are red', async () => {
    mocks.check.mockResolvedValue({
      ok: false,
      findings: [{ key: 'dogfood-catalog-hidden' }],
    });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: false,
      findings: [{ key: 'dogfood-catalog-hidden' }],
    });
  });

  it('503s and reports when the check itself throws', async () => {
    mocks.check.mockRejectedValue(new Error('db down'));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.capture).toHaveBeenCalledOnce();
  });
});
