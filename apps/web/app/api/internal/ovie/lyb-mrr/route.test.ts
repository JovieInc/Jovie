import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyCronRequest: vi.fn(),
  getLybDailyMrr: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mocks.verifyCronRequest,
}));
vi.mock('@/lib/ovie/lyb-mrr.server', () => ({
  getLybDailyMrr: mocks.getLybDailyMrr,
}));

import { GET } from './route';

describe('GET /api/internal/ovie/lyb-mrr', () => {
  it('authenticates before touching the billing source', async () => {
    mocks.verifyCronRequest.mockReturnValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await GET(
      new Request('https://jov.ie/api/internal/ovie/lyb-mrr')
    );
    expect(response.status).toBe(401);
    expect(mocks.getLybDailyMrr).not.toHaveBeenCalled();
  });

  it('serves the exact product record without caching', async () => {
    const record = {
      schema: 'jovie.lyb-daily-mrr/v1',
      product: 'logyourbody',
      state: 'stale',
      mrrCents: null,
    };
    mocks.verifyCronRequest.mockReturnValueOnce(null);
    mocks.getLybDailyMrr.mockResolvedValueOnce(record);
    const response = await GET(
      new Request('https://jov.ie/api/internal/ovie/lyb-mrr')
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(record);
  });
});
