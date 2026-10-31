import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  load: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.verify,
}));
vi.mock('@/lib/email/stream-deliverability.server', () => ({
  loadStreamDeliverability: mocks.load,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { GET } from '@/app/api/internal/ovie/email-deliverability/route';

describe('GET /api/internal/ovie/email-deliverability', () => {
  const request = () =>
    new Request('https://jov.ie/api/internal/ovie/email-deliverability');

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verify.mockResolvedValue(true);
  });

  it('rejects unauthorized reads before accessing delivery data', async () => {
    mocks.verify.mockResolvedValue(false);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('returns the current report without caching it', async () => {
    const report = {
      schema: 'jovie.email-deliverability/v1',
      domains: [],
      ok: true,
    };
    mocks.load.mockResolvedValue(report);
    const req = request();
    const response = await GET(req);
    expect(mocks.verify).toHaveBeenCalledWith(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('reports an unavailable database without exposing its error', async () => {
    const error = new Error('private database failure');
    mocks.load.mockRejectedValue(error);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Deliverability unavailable',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Email deliverability read failed',
      error
    );
  });
});
