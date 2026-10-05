import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';

const hoisted = vi.hoisted(() => ({
  limit: vi.fn(),
  lookup: vi.fn(),
  match: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  agentCreatorLookupLimiter: { limit: hoisted.limit },
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
  getClientIP: () => '203.0.113.10',
}));
vi.mock('@/lib/ingestion/creator-lookup', () => ({
  lookupCreator: hoisted.lookup,
  validateCreatorUrl: (url: string) =>
    /youtube\.com|instagram\.com|tiktok\.com|linktr\.ee/.test(url)
      ? { platform: 'youtube', sourceUrl: url }
      : null,
}));
vi.mock('@/lib/ingestion/creator-profile-match', () => ({
  findProfileForSource: hoisted.match,
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
    hoisted.match.mockResolvedValue(null);
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
      exists: false,
      displayName: 'Creator',
      bio: null,
      avatarUrl: null,
      links: [],
    });
    expect(hoisted.lookup).toHaveBeenCalledWith('https://youtube.com/@creator');
  });

  it('resolves to an existing Jovie profile without fetching the source', async () => {
    hoisted.match.mockResolvedValue({
      username: 'creator',
      displayName: 'Creator',
      profileUrl: 'https://jov.ie/creator',
    });

    const response = await get('https://youtube.com/@creator');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      platform: 'youtube',
      sourceUrl: 'https://youtube.com/@creator',
      exists: true,
      username: 'creator',
      displayName: 'Creator',
      profileUrl: 'https://jov.ie/creator',
    });
    expect(hoisted.match).toHaveBeenCalledWith(
      'youtube',
      'https://youtube.com/@creator'
    );
    expect(hoisted.lookup).not.toHaveBeenCalled();
  });

  it('falls back to extraction when the profile match fails', async () => {
    hoisted.match.mockRejectedValue(new Error('db down'));
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
    expect((await response.json()).exists).toBe(false);
    expect(hoisted.captureError).toHaveBeenCalledWith(
      'Agent creator lookup profile match failed',
      expect.any(Error)
    );
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

  it.each([
    ['LOGIN_REQUIRED', 502, 'SOURCE_LOGIN_WALL'],
    ['EMPTY_RESPONSE', 502, 'SOURCE_EMPTY'],
    ['SOCIAL_HTML_DISABLED', 422, 'SOURCE_UNSUPPORTED'],
  ] as const)(
    'maps %s to a stable %i %s error without paging Sentry',
    async (code, status, apiCode) => {
      hoisted.lookup.mockRejectedValue(new ExtractionError('blocked', code));
      const response = await get('https://www.instagram.com/creator');
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.error.code).toBe(apiCode);
      expect(body.error.message).toContain('YouTube channel URL');
      expect(hoisted.captureError).not.toHaveBeenCalled();
    }
  );

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
