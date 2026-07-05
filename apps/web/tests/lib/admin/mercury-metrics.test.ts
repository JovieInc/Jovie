import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminMercuryMetricsCache,
  getAdminMercuryMetrics,
} from '@/lib/admin/mercury-metrics';

const mockCaptureError = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  ServerFetchTimeoutError: class ServerFetchTimeoutError extends Error {
    timeoutMs: number;
    context: string;

    constructor(message: string, timeoutMs: number, context: string) {
      super(message);
      this.name = 'ServerFetchTimeoutError';
      this.timeoutMs = timeoutMs;
      this.context = context;
    }
  },
  serverFetch: fetchMock,
}));

describe('getAdminMercuryMetrics', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearAdminMercuryMetricsCache();
    fetchMock.mockReset();
    mockCaptureError.mockReset();
  });

  afterEach(() => {
    clearAdminMercuryMetricsCache();
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
      defaultStatus: 'unknown',
      errorMessage:
        'Mercury credentials not configured (set MERCURY_API_TOKEN or MERCURY_API_KEY and MERCURY_CHECKING_ACCOUNT_ID or MERCURY_ACCOUNT_ID)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calculates balance and burn rate from debit transactions', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    // Mercury API returns amounts in USD dollars (not cents).
    // $2,500.00 balance, $50.00 + $25.00 debits = $75.00 burn rate.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          availableBalance: 2500,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            { amount: 50, direction: 'debit' },
            { amount: 25, direction: 'debit' },
            { amount: 40, direction: 'credit' },
          ],
        }),
      });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(2500);
    expect(metrics.burnRateUsd).toBe(75);
    expect(metrics.burnWindowDays).toBe(30);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.defaultStatus).toBe('alive');
    expect(metrics.errorMessage).toBeUndefined();
    expect(mockCaptureError).not.toHaveBeenCalled();
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
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('Mercury API error');
    expect(mockCaptureError).toHaveBeenCalledOnce();
  });

  it('does not report ipNotWhitelisted 401 errors to Sentry', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: 'ipNotWhitelisted',
          message: 'Request IP is not whitelisted',
        }),
    });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(false);
    expect(metrics.errorMessage).toContain('401');
    expect(metrics.errorMessage).toContain('ipNotWhitelisted');
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('caches Mercury failures and avoids repeat API calls within TTL', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: 'ipNotWhitelisted',
          message: 'Request IP is not whitelisted',
        }),
    });

    const first = await getAdminMercuryMetrics();
    const second = await getAdminMercuryMetrics();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toEqual(first);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('reports unexpected Mercury failures to Sentry only once per cache window', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock.mockRejectedValue(new Error('Network error'));

    await getAdminMercuryMetrics();
    await getAdminMercuryMetrics();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mockCaptureError).toHaveBeenCalledOnce();
  });
});
