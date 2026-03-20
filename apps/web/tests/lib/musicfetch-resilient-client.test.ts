import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let token: string | undefined = 'test-token';
vi.mock('@/lib/env-server', () => ({
  env: {
    get MUSICFETCH_API_TOKEN() {
      return token;
    },
  },
}));

const mockLimit = vi.fn();
vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  createRateLimiter: () => ({
    limit: (...args: unknown[]) => mockLimit(...args),
  }),
}));

const mockGetRedis = vi.fn();
vi.mock('@/lib/redis', () => ({
  getRedis: () => mockGetRedis(),
}));

const mockReserveMusicfetchBudget = vi.fn();
vi.mock('@/lib/musicfetch/budget-guard', () => ({
  reserveMusicfetchBudget: (...args: unknown[]) =>
    mockReserveMusicfetchBudget(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('musicfetch resilient client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    token = 'test-token';
    mockGetRedis.mockReturnValue(null);
    mockLimit.mockResolvedValue({
      success: true,
      limit: 6,
      remaining: 5,
      reset: new Date(Date.now() + 60_000),
    });
    mockReserveMusicfetchBudget.mockResolvedValue(undefined);
  });

  it('retries transient 5xx errors with eventual success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { id: 'ok' } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { musicfetchRequest } = await import(
      '@/lib/musicfetch/resilient-client'
    );

    const result = await musicfetchRequest<{ result: { id: string } }>(
      '/url',
      new URLSearchParams({ url: 'https://open.spotify.com/artist/1' }),
      { timeoutMs: 2000 }
    );

    expect(result.result.id).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockReserveMusicfetchBudget).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent in-flight requests and only reserves one budget unit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { id: 'same' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { musicfetchRequest } = await import(
      '@/lib/musicfetch/resilient-client'
    );

    const params = new URLSearchParams({ isrc: 'USUM72212345' });
    const [a, b] = await Promise.all([
      musicfetchRequest<{ result: { id: string } }>('/isrc', params, {
        timeoutMs: 2000,
      }),
      musicfetchRequest<{ result: { id: string } }>('/isrc', params, {
        timeoutMs: 2000,
      }),
    ]);

    expect(a.result.id).toBe('same');
    expect(b.result.id).toBe('same');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockReserveMusicfetchBudget).toHaveBeenCalledTimes(1);
  });

  it('throws before fetch when the hard budget is exhausted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { MusicfetchBudgetExceededError } = await import(
      '@/lib/musicfetch/errors'
    );
    mockReserveMusicfetchBudget.mockRejectedValue(
      new MusicfetchBudgetExceededError(
        'MusicFetch daily hard budget exhausted',
        'daily',
        60
      )
    );

    const { musicfetchRequest } = await import(
      '@/lib/musicfetch/resilient-client'
    );

    await expect(
      musicfetchRequest(
        '/url',
        new URLSearchParams({ url: 'https://open.spotify.com/artist/1' }),
        {
          timeoutMs: 2000,
        }
      )
    ).rejects.toMatchObject({
      name: 'MusicfetchBudgetExceededError',
      budgetScope: 'daily',
      retryAfterSeconds: 60,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the local minute limiter as a retryable 429', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 6,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { MusicfetchRequestError } = await import('@/lib/musicfetch/errors');

    const { musicfetchRequest } = await import(
      '@/lib/musicfetch/resilient-client'
    );

    await expect(
      musicfetchRequest(
        '/url',
        new URLSearchParams({ url: 'https://open.spotify.com/artist/1' }),
        {
          timeoutMs: 2000,
        }
      )
    ).rejects.toBeInstanceOf(MusicfetchRequestError);

    await expect(
      musicfetchRequest(
        '/url',
        new URLSearchParams({ url: 'https://open.spotify.com/artist/1' }),
        {
          timeoutMs: 2000,
        }
      )
    ).rejects.toMatchObject({
      statusCode: 429,
    });

    expect(mockReserveMusicfetchBudget).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
