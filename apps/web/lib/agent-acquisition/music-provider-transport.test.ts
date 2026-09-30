import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  startSpan: (_options: unknown, run: (span: unknown) => unknown) =>
    run({ setAttribute: vi.fn() }),
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music-auth', () => ({
  isAppleMusicConfigured: () => true,
  getAppleMusicAuthHeaders: async () => ({ Authorization: 'Bearer test-only' }),
  clearAppleMusicTokenCache: vi.fn(),
}));

import { clearDspCaches } from '@/lib/dsp-enrichment/cache';
import { appleMusicCircuitBreaker } from '@/lib/dsp-enrichment/circuit-breakers';
import { getArtist as appleArtist } from '@/lib/dsp-enrichment/providers/apple-music';
import { spotifyCircuitBreaker } from '@/lib/spotify/circuit-breaker';
import { spotifyClient } from '@/lib/spotify/client';

const ID = '4Z8W4fKeB5YxbusRsdQVPb';
const raw = {
  id: ID,
  name: 'Radiohead',
  images: [],
  genres: ['rock'],
  followers: { total: 1 },
  popularity: 1,
  external_urls: { spotify: `https://open.spotify.com/artist/${ID}` },
};
const apple = { id: '657515', attributes: { name: 'Radiohead' } };

function stalledBody(signal: AbortSignal) {
  return new Response(
    new ReadableStream({
      start(controller) {
        signal.addEventListener(
          'abort',
          () => controller.error(new DOMException('Aborted', 'AbortError')),
          { once: true }
        );
      },
    }),
    { status: 200 }
  );
}

describe('canonical provider HTTP transport for public music reads', () => {
  beforeEach(() => {
    clearDspCaches();
    spotifyCircuitBreaker.reset();
    appleMusicCircuitBreaker.reset();
    vi.spyOn(spotifyClient, 'getAccessToken').mockResolvedValue('test-only');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['spotify', 'apple'] as const)(
    '%s aborts a stalled response body and never retries caller cancellation',
    async provider => {
      const controller = new AbortController();
      const fetcher = vi.fn(async (_url: unknown, options: RequestInit) =>
        stalledBody(options.signal!)
      );
      vi.stubGlobal('fetch', fetcher);
      const result =
        provider === 'spotify'
          ? spotifyClient.getArtist(ID, { signal: controller.signal })
          : appleArtist('657515', { signal: controller.signal });
      const rejected = expect(result).rejects.toThrow();
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      controller.abort();
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['spotify', 'apple'] as const)(
    '%s keeps its deadline active while reading JSON and caps retries',
    async provider => {
      vi.useFakeTimers();
      const fetcher = vi.fn(async (_url: unknown, options: RequestInit) =>
        stalledBody(options.signal!)
      );
      vi.stubGlobal('fetch', fetcher);
      const result =
        provider === 'spotify'
          ? spotifyClient.getArtist(ID)
          : appleArtist('657515');
      const rejected = expect(result).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(60_000);
      await rejected;
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  );

  it('isolates Apple regional caches: a GB result cannot fabricate a US match', async () => {
    const fetcher = vi.fn(async (url: unknown) =>
      String(url).includes('/gb/')
        ? Response.json({ data: [apple] })
        : new Response('', { status: 404 })
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await appleArtist('657515', { storefront: 'gb' })).toEqual(apple);
    await expect(
      appleArtist('657515', { storefront: 'us' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['spotify', 'apple'] as const)(
    '%s repeated client cancellations do not open the shared provider circuit',
    async provider => {
      const fetcher = vi.fn(async (_url: unknown, options: RequestInit) =>
        stalledBody(options.signal!)
      );
      vi.stubGlobal('fetch', fetcher);
      for (let attempt = 0; attempt < 21; attempt++) {
        const controller = new AbortController();
        const result =
          provider === 'spotify'
            ? spotifyClient.getArtist(ID, { signal: controller.signal })
            : appleArtist('657515', { signal: controller.signal });
        const rejected = expect(result).rejects.toThrow('Request cancelled');
        await vi.waitFor(() =>
          expect(fetcher).toHaveBeenCalledTimes(attempt + 1)
        );
        controller.abort();
        await rejected;
      }
      const breaker =
        provider === 'spotify'
          ? spotifyCircuitBreaker
          : appleMusicCircuitBreaker;
      expect(breaker.getStats()).toMatchObject({
        state: 'CLOSED',
        totalFailures: 0,
      });
    }
  );

  it.each(['spotify', 'apple'] as const)(
    '%s cancellation during retry sleep does not poison the shared circuit',
    async provider => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'Temporary failure' } },
            { status: 503 }
          )
        );
      vi.stubGlobal('fetch', fetcher);
      const result =
        provider === 'spotify'
          ? spotifyClient.getArtist(ID, { signal: controller.signal })
          : appleArtist('657515', { signal: controller.signal });
      const rejected = expect(result).rejects.toThrow('Request cancelled');
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      controller.abort();
      await vi.advanceTimersByTimeAsync(30_000);
      await rejected;
      const breaker =
        provider === 'spotify'
          ? spotifyCircuitBreaker
          : appleMusicCircuitBreaker;
      expect(breaker.getStats()).toMatchObject({
        state: 'CLOSED',
        totalFailures: 0,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  it.each([429, 503])(
    'Spotify retries transient HTTP %s within the existing three-attempt cap',
    async status => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { error: { message: 'Temporary upstream error' } },
            { status, headers: { 'Retry-After': '1' } }
          )
        )
        .mockResolvedValueOnce(
          Response.json(
            { error: { message: 'Temporary upstream error' } },
            { status }
          )
        )
        .mockResolvedValueOnce(Response.json(raw));
      vi.stubGlobal('fetch', fetcher);
      const result = spotifyClient.getArtist(ID);
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await result).spotifyId).toBe(ID);
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  );

  it('invalid Spotify JSON is rejected without fabricating an artist', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(spotifyClient.getArtist(ID)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
