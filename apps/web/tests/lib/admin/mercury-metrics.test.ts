import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminMercuryMetricsCache,
  getAdminMercuryMetrics,
} from '@/lib/admin/mercury-metrics';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';

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
    vi.useRealTimers();
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
      burnRateAvailable: false,
      isConfigured: false,
      isAvailable: false,
      defaultStatus: 'unknown',
      observedAtIso: expect.any(String),
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
    expect(metrics.burnRateAvailable).toBe(true);
    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.defaultStatus).toBe('alive');
    expect(metrics.errorMessage).toBeUndefined();
    expect(mockCaptureError).not.toHaveBeenCalled();
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      '/api/v1/account/acct_123'
    );
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      '/api/v1/account/acct_123/transactions'
    );
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
    expect(metrics.burnRateAvailable).toBe(false);
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

  it('does not report Mercury 404 notFound errors to Sentry', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          errors: {
            notFound: [
              'We couldn’t find the data associated with your request. Please contact help@mercury.com',
            ],
          },
        }),
    });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.isConfigured).toBe(true);
    expect(metrics.isAvailable).toBe(false);
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('404');
    expect(metrics.errorMessage).toContain('/account/acct_123');
    expect(metrics.errorMessage).toContain('notFound');
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

  it('fails closed when balance succeeds but the burn window times out', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ availableBalance: 2500 }),
      })
      .mockRejectedValueOnce(
        new ServerFetchTimeoutError(
          'Mercury transactions timed out',
          5000,
          'mercury-transactions'
        )
      );

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(2500);
    expect(metrics.burnRateUsd).toBe(0);
    expect(metrics.burnRateAvailable).toBe(false);
    expect(metrics.isAvailable).toBe(true);
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('transaction window unavailable');
    expect(mockCaptureError).toHaveBeenCalledOnce();
  });

  it('rejects a successful response with a missing balance instead of measuring zero', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.isAvailable).toBe(false);
    expect(metrics.burnRateAvailable).toBe(false);
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('balance is missing or invalid');
  });

  it('preserves balance but degrades malformed transaction collections', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ availableBalance: 2500 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(2500);
    expect(metrics.burnRateAvailable).toBe(false);
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('collection is missing');
  });

  it('degrades rather than returning a truncated burn window at the page cap', async () => {
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ availableBalance: 2500 }),
    });
    for (let page = 1; page <= 20; page++) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [{ amount: 1, direction: 'debit', currency: 'USD' }],
          hasMore: true,
          nextCursor: `cursor-${page}`,
        }),
      });
    }

    const metrics = await getAdminMercuryMetrics();

    expect(metrics.balanceUsd).toBe(2500);
    expect(metrics.burnRateUsd).toBe(0);
    expect(metrics.burnRateAvailable).toBe(false);
    expect(metrics.defaultStatus).toBe('unknown');
    expect(metrics.errorMessage).toContain('exceeded 20 pages');
  });

  it('preserves the producer observation time across cache hits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T18:00:00.000Z'));
    process.env.MERCURY_API_TOKEN = 'token';
    process.env.MERCURY_CHECKING_ACCOUNT_ID = 'acct_123';
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ availableBalance: 2500 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

    const first = await getAdminMercuryMetrics();
    vi.setSystemTime(new Date('2026-08-22T18:01:00.000Z'));
    const cached = await getAdminMercuryMetrics();

    expect(cached.observedAtIso).toBe('2026-08-22T18:00:00.000Z');
    expect(cached.observedAtIso).toBe(first.observedAtIso);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
