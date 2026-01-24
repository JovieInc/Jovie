import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';

const fetchMock = vi.fn();

describe('getAdminMercuryMetrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it('returns zeroed metrics when Mercury credentials are missing', async () => {
    delete process.env.MERCURY_API_TOKEN;
    delete process.env.MERCURY_API_KEY;
    delete process.env.MERCURY_CHECKING_ACCOUNT_ID;
    delete process.env.MERCURY_ACCOUNT_ID;

    const metrics = await getAdminMercuryMetrics();

    expect(metrics).toEqual({
      balanceUsd: 0,
      burnRateUsd: 0,
      burnWindowDays: 30,
      isConfigured: false,
      isAvailable: false,
      errorMessage:
        'Mercury credentials not configured (set MERCURY_API_TOKEN or MERCURY_API_KEY and MERCURY_CHECKING_ACCOUNT_ID or MERCURY_ACCOUNT_ID)',
    });
  });

  it('calculates balance and burn rate from debit transactions', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableBalance: 250000,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            { amount: 5000, direction: 'debit' },
            { amount: 2500, direction: 'debit' },
            { amount: 4000, direction: 'credit' },
          ],
        }),
      });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(2500);
    expect(metrics.burnRateUsd).toBe(75);
    expect(metrics.burnWindowDays).toBe(30);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.errorMessage).toBeUndefined();
  });

  it('returns isAvailable false when Mercury API fails', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(0);
    expect(metrics.burnRateUsd).toBe(0);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(false);
    expect(metrics.errorMessage).toContain('Mercury API error');
  });
});
