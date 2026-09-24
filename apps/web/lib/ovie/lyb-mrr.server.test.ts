import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getLybDailyMrr } from './lyb-mrr.server';

const NOW = new Date('2026-09-24T05:00:00Z');
const DAY = Date.parse('2026-09-24T00:00:00Z');
const options = {
  object: 'chart_options',
  resolutions: [{ id: 'day', display_name: 'day' }],
};
const chart = {
  object: 'chart_data',
  category: 'revenue',
  resolution: 'day',
  yaxis_currency: 'USD',
  yaxis: '$',
  start_date: DAY,
  end_date: DAY,
  last_computed_at: Date.parse('2026-09-24T04:00:00Z'),
  values: [[0]],
  user_selectors: { revenue_type: 'revenue' },
};

afterEach(() => vi.unstubAllEnvs());

describe('RevenueCat LogYourBody MRR read', () => {
  it('returns unknown without credentials and makes no provider call', async () => {
    vi.stubEnv('REVENUECAT_LYB_SECRET_API_KEY', undefined);
    const fetcher = vi.fn<typeof fetch>();
    const record = await getLybDailyMrr(NOW, fetcher);
    expect(record).toMatchObject({ state: 'unavailable', mrrCents: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requests one UTC day in USD and maps a provider zero', async () => {
    vi.stubEnv('REVENUECAT_LYB_SECRET_API_KEY', 'secret-for-test');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(options))
      .mockResolvedValueOnce(Response.json(chart));
    const record = await getLybDailyMrr(NOW, fetcher);
    expect(record).toMatchObject({ state: 'fresh', mrrCents: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [optionsUrl, requestOptions] = fetcher.mock.calls[0] as Parameters<
      typeof fetch
    >;
    expect(String(optionsUrl)).toBe(
      'https://api.revenuecat.com/v2/projects/proj2385165b/charts/mrr/options'
    );
    expect(requestOptions).toMatchObject({ cache: 'no-store' });
    const [chartUrl] = fetcher.mock.calls[1] as Parameters<typeof fetch>;
    const url = new URL(String(chartUrl));
    expect(url.pathname).toBe('/v2/projects/proj2385165b/charts/mrr');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      currency: 'USD',
      realtime: 'true',
      resolution: 'day',
      start_date: '2026-09-24',
      end_date: '2026-09-24',
      selectors: '{"revenue_type":"revenue"}',
    });
  });

  it('keeps rejected or malformed provider responses unknown', async () => {
    vi.stubEnv('REVENUECAT_LYB_SECRET_API_KEY', 'secret-for-test');
    const rejected = await getLybDailyMrr(
      NOW,
      async () => new Response(null, { status: 403 })
    );
    const malformed = await getLybDailyMrr(NOW, async () =>
      Response.json({ object: 'chart_options', resolutions: [] })
    );
    expect(rejected).toMatchObject({ state: 'unavailable', mrrCents: null });
    expect(malformed).toMatchObject({ state: 'unreconciled', mrrCents: null });
  });
});
