import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ musicBrainzLookupLimiter: { limit } }));
vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  musicBrainzCircuitBreaker: { execute: (fn: () => Promise<unknown>) => fn() },
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));

import {
  browseMusicBrainzCatalog,
  getMusicBrainzArtist,
  lookupMusicBrainzArtistsByUrl,
} from './musicbrainz';

const id = '51972833-bb04-46b7-9401-45a5ab449ebd';
const artist = { id, name: 'Tim White' };
const maxBytes = 2_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  limit.mockReset().mockResolvedValue({ success: true, reset: new Date() });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MusicBrainz request bounds', () => {
  it.each([401, 403])('does not retry inaccessible HTTP %s', async status => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockImplementation(
      async () => new Response(new ReadableStream({ cancel }), { status })
    );
    const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
      statusCode: status,
    });
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([null, '{broken', 'null', '[]'])(
    'rejects malformed object payload %s without retry',
    async body => {
      vi.mocked(fetch).mockImplementation(async () => new Response(body));
      const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
        errorCode: 'INVALID_RESPONSE',
      });
      await vi.runAllTimersAsync();
      await result;
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects an advertised oversized body before reading and cancels it', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': String(maxBytes + 1) },
    });
    vi.mocked(fetch).mockResolvedValue(response);
    const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
      errorCode: 'RESPONSE_TOO_LARGE',
    });
    await vi.runAllTimersAsync();
    await result;
    expect(response.body?.locked).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '1'])(
    'counts streamed UTF-8 bytes despite content-length %s',
    async length => {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream({
          start(controller) {
            const chunk = new TextEncoder().encode('é'.repeat(500_001));
            controller.enqueue(chunk);
            controller.enqueue(chunk);
          },
          cancel,
        }),
        { headers: length ? { 'content-length': length } : undefined }
      );
      vi.mocked(fetch).mockResolvedValue(response);
      const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
        errorCode: 'RESPONSE_TOO_LARGE',
      });
      await vi.runAllTimersAsync();
      await result;
      expect(cancel).toHaveBeenCalledOnce();
      expect(response.body?.locked).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('accepts a JSON object exactly at the byte limit', async () => {
    const json = JSON.stringify(artist);
    vi.mocked(fetch).mockResolvedValue(
      new Response(json + ' '.repeat(maxBytes - json.length))
    );
    await expect(getMusicBrainzArtist(id)).resolves.toMatchObject(artist);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it.each(['seconds', 'date'])(
    'honors a bounded Retry-After %s on 503',
    async format => {
      vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
      const retryAfter =
        format === 'seconds' ? '3' : new Date(Date.now() + 3000).toUTCString();
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          new Response(null, {
            status: 503,
            headers: { 'retry-after': retryAfter },
          })
        )
        .mockResolvedValueOnce(Response.json(artist));
      const result = getMusicBrainzArtist(id);
      await vi.advanceTimersByTimeAsync(2999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toMatchObject(artist);
      expect(limit).toHaveBeenCalledTimes(2);
    }
  );

  it.each([429, 503])(
    'surfaces long Retry-After for HTTP %s without an early retry',
    async status => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(null, { status, headers: { 'retry-after': '120' } })
      );
      const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
        statusCode: status,
        errorCode: 'RATE_LIMITED',
        retryAfterMs: 120_000,
      });
      await vi.runAllTimersAsync();
      await result;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(limit).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['invalid', '-1', new Date(0).toUTCString()])(
    'ignores invalid Retry-After %s within the existing retry budget',
    async retryAfter => {
      vi.mocked(fetch).mockImplementation(
        async () =>
          new Response(null, {
            status: 503,
            headers: { 'retry-after': retryAfter },
          })
      );
      const result = expect(getMusicBrainzArtist(id)).rejects.toMatchObject({
        statusCode: 503,
      });
      await vi.runAllTimersAsync();
      await result;
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['quota', 'retry', 'body'])(
    'cancels promptly during %s without spending another quota decision',
    async phase => {
      const caller = new AbortController();
      const cancel = vi.fn();
      if (phase === 'quota')
        limit.mockResolvedValue({
          success: false,
          reset: new Date(Date.now() + 1000),
        });
      vi.mocked(fetch).mockImplementation(async () =>
        phase === 'body'
          ? new Response(new ReadableStream({ cancel }))
          : new Response(null, { status: 503 })
      );
      const result = getMusicBrainzArtist(id, {
        signal: caller.signal,
        waitForQuota: true,
      });
      const rejected = expect(result).rejects.toBeInstanceOf(
        CallerCancellationError
      );
      await vi.advanceTimersByTimeAsync(100);
      caller.abort();
      await rejected;
      expect(limit).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(phase === 'quota' ? 0 : 1);
      if (phase === 'body') expect(cancel).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
  it.each(['url', 'catalog'])('cancels %s retry waits promptly', async kind => {
    const caller = new AbortController();
    vi.mocked(fetch).mockImplementation(
      async () => new Response(null, { status: 503 })
    );
    const result =
      kind === 'url'
        ? lookupMusicBrainzArtistsByUrl(
            'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
            caller.signal
          )
        : browseMusicBrainzCatalog({
            entity: 'recording',
            by: 'artist',
            mbid: id,
            signal: caller.signal,
          });
    const rejected = expect(result).rejects.toBeInstanceOf(
      CallerCancellationError
    );
    await vi.advanceTimersByTimeAsync(100);
    caller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
