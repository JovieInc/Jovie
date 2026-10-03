import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';

const hoisted = vi.hoisted(() => ({
  limit: vi.fn(),
  lookup: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  agentCreatorLookupLimiter: { limit: hoisted.limit },
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/ingestion/creator-lookup', () => ({
  lookupCreator: hoisted.lookup,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const { GET } = await import('./route');

function get(url?: string) {
  const query = url ? `?url=${encodeURIComponent(url)}` : '';
  return GET(new Request(`https://jov.ie/api/agents/creator-lookup${query}`));
}

describe('GET /api/agents/creator-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.limit.mockResolvedValue({ success: true });
  });

  it('returns extracted creator fields without creating a profile', async () => {
    hoisted.lookup.mockResolvedValue({
      platform: 'youtube',
      sourceUrl: 'https://www.youtube.com/@creator/about',
      displayName: 'Creator',
      bio: null,
      avatarUrl: null,
      links: [],
    });

    const response = await get('https://youtube.com/@creator');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      platform: 'youtube',
      sourceUrl: 'https://www.youtube.com/@creator/about',
      displayName: 'Creator',
      bio: null,
      avatarUrl: null,
      links: [],
    });
    expect(hoisted.lookup).toHaveBeenCalledWith('https://youtube.com/@creator');
  });

  it('rejects missing and unsupported URLs before any source fetch', async () => {
    expect((await get()).status).toBe(400);
    expect(hoisted.lookup).not.toHaveBeenCalled();

    expect((await get('http://youtube.com/@creator')).status).toBe(400);
    const credentialedUrl = [
      'https://user',
      ':credential@youtube.com/@creator',
    ].join('');
    expect((await get(credentialedUrl)).status).toBe(400);
    expect(hoisted.lookup).not.toHaveBeenCalled();

    hoisted.lookup.mockResolvedValue(null);
    const response = await get('https://example.com/creator');
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe('UNSUPPORTED_URL');
  });

  it('fails closed when the durable limiter denies or is unavailable', async () => {
    hoisted.limit.mockResolvedValueOnce({ success: false });
    const limited = await get('https://youtube.com/@creator');
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');

    hoisted.limit.mockResolvedValueOnce({ success: false, unavailable: true });
    const unavailable = await get('https://youtube.com/@creator');
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error.code).toBe(
      'TEMPORARILY_UNAVAILABLE'
    );
    expect(hoisted.lookup).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', 404, 'CREATOR_NOT_FOUND'],
    ['RATE_LIMITED', 503, 'SOURCE_RATE_LIMITED'],
    ['FETCH_TIMEOUT', 504, 'SOURCE_TIMEOUT'],
    ['FETCH_FAILED', 502, 'LOOKUP_FAILED'],
  ] as const)(
    'maps source %s failures to a stable API error',
    async (sourceCode, status, apiCode) => {
      hoisted.lookup.mockRejectedValue(
        new ExtractionError('source detail', sourceCode)
      );

      const response = await get('https://youtube.com/@creator');

      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(apiCode);
      expect(hoisted.captureError).toHaveBeenCalledTimes(
        sourceCode === 'FETCH_FAILED' ? 1 : 0
      );
    }
  );
});
