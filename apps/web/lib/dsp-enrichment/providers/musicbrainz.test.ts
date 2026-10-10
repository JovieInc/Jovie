import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';
import { CircuitBreaker } from '@/lib/spotify/circuit-breaker';

vi.mock('server-only', () => ({}));

const { mockExecute, mockLimit, mockWarn } = vi.hoisted(() => ({
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockLimit: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  musicBrainzLookupLimiter: {
    limit: mockLimit,
  },
}));

vi.mock('@/lib/dsp-enrichment/circuit-breakers', () => ({
  musicBrainzCircuitBreaker: {
    execute: mockExecute,
    getState: vi.fn(() => 'CLOSED'),
    getStats: vi.fn(() => ({
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      totalFailures: 0,
      totalSuccesses: 0,
      requestsInWindow: 0,
    })),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockWarn,
  },
}));

import timUrl from './fixtures/tim-white-musicbrainz-url.json';
import {
  bulkLookupMusicBrainzByIsrc,
  getMusicBrainzArtist,
  lookupMusicBrainzArtistsByUrl,
  lookupMusicBrainzByIsrc,
  lookupMusicBrainzRecordingUrlRels,
  lookupMusicBrainzReleaseByBarcode,
  MusicBrainzError,
  matchMusicBrainzArtistByName,
} from './musicbrainz';

const TIM_ID = '51972833-bb04-46b7-9401-45a5ab449ebd';
const OTHER_TIM_ID = '8ac57f9f-0188-450a-b177-db336e5c2870';
const TIM_SPOTIFY = 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm';

function mockResponse(payload: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue(Response.json(payload, { status }));
}

describe('MusicBrainz Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockImplementation(fn => fn());
    mockLimit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 1,
      reset: new Date(),
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not retry limiter-triggered 429 errors', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      limit: 1,
      remaining: 0,
      reset: new Date(),
      reason: 'Rate limit exceeded',
    });

    await expect(lookupMusicBrainzByIsrc('USUM71703861')).rejects.toEqual(
      expect.objectContaining<Partial<MusicBrainzError>>({
        errorCode: 'RATE_LIMITED',
        statusCode: 429,
      })
    );

    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves partial bulk results when an ISRC lookup fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recordings: [{ id: 'rec-1' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response('Rate limit exceeded', { status: 429 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recordings: [{ id: 'rec-3' }],
          }),
          { status: 200 }
        )
      );

    vi.stubGlobal('fetch', fetchMock);

    const results = await bulkLookupMusicBrainzByIsrc([
      'USRC17607839',
      'USRC17607840',
      'USRC17607841',
    ]);

    expect(Array.from(results.keys())).toEqual([
      'USRC17607839',
      'USRC17607841',
    ]);
    expect(results.get('USRC17607839')?.id).toBe('rec-1');
    expect(results.get('USRC17607841')?.id).toBe('rec-3');
    expect(mockWarn).toHaveBeenCalledWith(
      'MusicBrainz ISRC lookup failed during bulk lookup',
      expect.objectContaining({
        error: expect.any(MusicBrainzError),
        isrc: 'USRC17607840',
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockLimit).toHaveBeenCalledTimes(3);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('deduplicates URL identities and rejects ended or malformed relationships', async () => {
    mockResponse({
      resource: TIM_SPOTIFY,
      relations: [
        { artist: { id: TIM_ID, name: 'Tim White' } },
        { artist: { id: TIM_ID, name: 'Tim White' } },
        { ended: true, artist: { id: OTHER_TIM_ID, name: 'Tim White' } },
        { artist: { id: 'not-an-mbid', name: 'Tim White' } },
        { artist: { id: OTHER_TIM_ID, name: '' } },
        {},
      ],
    });
    await expect(lookupMusicBrainzArtistsByUrl(TIM_SPOTIFY)).resolves.toEqual([
      { id: TIM_ID, name: 'Tim White' },
    ]);
  });

  it('requires an exact URL response and propagates identity failures', async () => {
    mockResponse({
      resource: 'https://open.spotify.com/artist/wrong',
      relations: [],
    });
    await expect(
      lookupMusicBrainzArtistsByUrl(TIM_SPOTIFY)
    ).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
      statusCode: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([400, 404])(
    'treats an ISRC HTTP %s as absent without retry',
    async status => {
      mockResponse({}, status);
      await expect(lookupMusicBrainzByIsrc('USABC1234567')).resolves.toEqual(
        []
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects an artist identifier mismatch instead of leaking another artist metadata', async () => {
    mockResponse({ id: OTHER_TIM_ID, name: 'Tim White' });
    await expect(getMusicBrainzArtist(TIM_ID)).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
      statusCode: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid', '../url', 'a'.repeat(500)])(
    'rejects invalid MBIDs before a network request: %s',
    async id => {
      await expect(getMusicBrainzArtist(id)).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('accepts uppercase MBIDs and preserves the legacy detail include by default', async () => {
    mockResponse({ id: TIM_ID, name: 'Tim White' });
    await expect(
      getMusicBrainzArtist(TIM_ID.toUpperCase())
    ).resolves.toMatchObject({ id: TIM_ID });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/artist/${TIM_ID}?inc=aliases+tags+genres+url-rels&fmt=json`
      ),
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Jovie/1.0.0 (https://jov.ie)',
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('returns real same-name choices rather than fabricated MBIDs', async () => {
    mockResponse({
      artists: [
        { id: TIM_ID, name: 'Tim White', score: 100 },
        { id: OTHER_TIM_ID, name: 'Tim White', score: 100 },
        { id: TIM_ID, name: 'Tim White', score: 100 },
        { id: 'invalid', name: 'Tim White' },
        { id: '11111111-1111-1111-1111-111111111111', name: 'Timothy White' },
      ],
    });
    await expect(matchMusicBrainzArtistByName('Tim White')).resolves.toEqual({
      status: 'ambiguous',
      count: 2,
      artists: [
        { id: TIM_ID, name: 'Tim White' },
        { id: OTHER_TIM_ID, name: 'Tim White' },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('hydrates one exact normalized name, and leaves approximate names unresolved', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ artists: [{ id: TIM_ID, name: 'TIM WHITE' }] })
      )
      .mockResolvedValueOnce(Response.json({ id: TIM_ID, name: 'Tim White' }));
    await expect(
      matchMusicBrainzArtistByName('Tim White')
    ).resolves.toMatchObject({ status: 'found', artist: { id: TIM_ID } });
    mockResponse({ artists: [{ id: TIM_ID, name: 'Timothy White' }] });
    await expect(matchMusicBrainzArtistByName('Tim White')).resolves.toEqual({
      status: 'none',
    });
  });

  it('does not perform a lookup for an empty artist name', async () => {
    await expect(matchMusicBrainzArtistByName('  ')).resolves.toEqual({
      status: 'none',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('waits once for a chained quota interval, then respects the distributed decision', async () => {
    vi.useFakeTimers();
    mockLimit.mockResolvedValueOnce({
      success: false,
      reset: new Date(Date.now() + 1000),
      remaining: 0,
    });
    mockResponse({ id: TIM_ID, name: 'Tim White' });
    const result = getMusicBrainzArtist(TIM_ID, { waitForQuota: true });
    await vi.advanceTimersByTimeAsync(1024);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ id: TIM_ID });
    expect(mockLimit).toHaveBeenCalledTimes(2);
  });

  it.each([
    { unavailable: true },
    { backend: 'unavailable' },
    { reset: new Date(Date.now() + 60000) },
  ])(
    'does not bypass unavailable or long quota windows: %j',
    async overrides => {
      mockLimit.mockResolvedValue({
        success: false,
        reset: new Date(Date.now() + 1000),
        ...overrides,
      });
      await expect(
        getMusicBrainzArtist(TIM_ID, { waitForQuota: true })
      ).rejects.toMatchObject({ statusCode: 429 });
      expect(mockLimit).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('stops after the second quota rejection rather than looping', async () => {
    vi.useFakeTimers();
    mockLimit.mockResolvedValue({
      success: false,
      reset: new Date(Date.now() + 1000),
    });
    const result = expect(
      getMusicBrainzArtist(TIM_ID, { waitForQuota: true })
    ).rejects.toMatchObject({ statusCode: 429 });
    await vi.runAllTimersAsync();
    await result;
    expect(mockLimit).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry an upstream 429 and propagates a closed circuit', async () => {
    mockResponse({}, 429);
    await expect(
      lookupMusicBrainzArtistsByUrl(TIM_SPOTIFY)
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
    mockExecute.mockRejectedValueOnce(new Error('circuit open'));
    await expect(getMusicBrainzArtist(TIM_ID)).rejects.toThrow('circuit open');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 with bounded backoff and succeeds', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ recordings: [{ id: 'recording' }] })
      );
    const result = lookupMusicBrainzByIsrc('USABC1234567');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual([{ id: 'recording' }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the timeout active while reading a stalled response body', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      async (_input, init) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              (init?.signal as AbortSignal).onabort = () =>
                reject(
                  Object.assign(new Error('aborted body'), {
                    name: 'AbortError',
                  })
                );
            }),
        }) as Response
    );
    const result = expect(getMusicBrainzArtist(TIM_ID)).rejects.toMatchObject({
      errorCode: 'TIMEOUT',
    });
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed JSON after bounded retries', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(
      Object.assign(new Response(), {
        json: async () => {
          throw new SyntaxError('bad JSON');
        },
      })
    );
    const result = expect(
      lookupMusicBrainzByIsrc('USABC1234567')
    ).rejects.toThrow('bad JSON');
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('resolves a barcode only from an exact release hit and retains artist credits', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          releases: [
            { id: OTHER_TIM_ID, barcode: '123' },
            { id: TIM_ID, title: 'Release', barcode: '123456789012' },
          ],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          id: TIM_ID,
          title: 'Release',
          barcode: '123456789012',
          'artist-credit': [{ artist: { name: 'Tim White' } }],
          relations: [],
        })
      );
    await expect(
      lookupMusicBrainzReleaseByBarcode('123-456-789-012')
    ).resolves.toMatchObject({
      id: TIM_ID,
      title: 'Release',
      artist: 'Tim White',
      barcode: '123456789012',
    });
    mockResponse({ releases: [] });
    await expect(
      lookupMusicBrainzReleaseByBarcode('123456789012')
    ).resolves.toBeNull();
    await expect(
      lookupMusicBrainzReleaseByBarcode('not a barcode')
    ).resolves.toBeNull();
  });

  it('hydrates recording URL relations from an ISRC, and handles no recordings', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({ recordings: [{ id: 'recording' }] })
      )
      .mockResolvedValueOnce(
        Response.json({
          relations: [
            {
              type: 'streaming',
              url: { resource: 'https://example.com/track' },
            },
          ],
        })
      );
    await expect(
      lookupMusicBrainzRecordingUrlRels('USABC1234567')
    ).resolves.toEqual([expect.objectContaining({ type: 'streaming' })]);
    mockResponse({ recordings: [] });
    await expect(
      lookupMusicBrainzRecordingUrlRels('USABC1234567')
    ).resolves.toEqual([]);
  });
  it('resolves Spotify share/locale URLs using the exact canonical artist ID', async () => {
    mockResponse(timUrl);
    await expect(
      lookupMusicBrainzArtistsByUrl(
        'https://open.spotify.com/intl-fr/artist/4Uwpa6zW3zzCSQvooQNksm/?si=share#fragment'
      )
    ).resolves.toEqual([expect.objectContaining({ id: TIM_ID })]);
    expect(
      new URL(String(vi.mocked(fetch).mock.calls[0]?.[0])).searchParams.get(
        'resource'
      )
    ).toBe(TIM_SPOTIFY);
  });

  it('looks up Apple URL aliases in one bounded MusicBrainz request', async () => {
    const original =
      'https://music.apple.com/us/artist/tim-white/859547284?app=music';
    const canonical = 'https://itunes.apple.com/us/artist/id859547284';
    mockResponse({
      urls: [
        {
          resource: canonical,
          relations: [{ artist: { id: TIM_ID, name: 'Tim White' } }],
        },
      ],
    });
    await expect(lookupMusicBrainzArtistsByUrl(original)).resolves.toEqual([
      { id: TIM_ID, name: 'Tim White' },
    ]);
    const url = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(url.searchParams.getAll('resource')).toEqual([
      'https://music.apple.com/us/artist/tim-white/859547284',
      'https://music.apple.com/us/artist/859547284',
      canonical,
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'not-a-url',
    'file:///etc/passwd',
    ['https://fixture-user', ':fixture-password@example.com'].join(''),
    'https://example.com:444/artist',
  ])('rejects unsafe resource URLs without a fetch: %s', async url => {
    await expect(lookupMusicBrainzArtistsByUrl(url)).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops cancelled MusicBrainz reads without retrying them', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(
      getMusicBrainzArtist(TIM_ID, { signal: controller.signal })
    ).rejects.toBeInstanceOf(CallerCancellationError);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      getMusicBrainzArtist(TIM_ID, { signal: controller.signal })
    ).rejects.toBeInstanceOf(CallerCancellationError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the real circuit breaker healthy after repeated caller cancellations', async () => {
    const breaker = new CircuitBreaker({
      name: 'musicbrainz',
      failureThreshold: 5,
      minimumRequestCount: 10,
      resetTimeout: 90_000,
      failureWindow: 120_000,
      successThreshold: 2,
    });
    mockExecute.mockImplementation(fn => breaker.execute(fn));
    const controller = new AbortController();
    controller.abort();
    for (let index = 0; index < 10; index++) {
      await expect(
        getMusicBrainzArtist(TIM_ID, { signal: controller.signal })
      ).rejects.toThrow('Request cancelled');
    }
    expect(breaker.getStats()).toMatchObject({
      state: 'CLOSED',
      failures: 0,
      totalFailures: 0,
    });
    expect(mockLimit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    mockResponse({ id: TIM_ID, name: 'Tim White' });
    await expect(getMusicBrainzArtist(TIM_ID)).resolves.toMatchObject({
      id: TIM_ID,
      name: 'Tim White',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops a caller cancelled during quota waiting before spending another quota decision', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mockLimit.mockResolvedValue({
      success: false,
      reset: new Date(Date.now() + 1000),
    });
    const result = getMusicBrainzArtist(TIM_ID, {
      waitForQuota: true,
      signal: controller.signal,
    });
    // Handle the promise immediately while fake timers advance its rejection.
    void result.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();
    await expect(result).rejects.toBeInstanceOf(CallerCancellationError);
    expect(mockLimit).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['東京', '大阪'],
    ['東京', 'Tim White'],
    ['سلام', 'حياة'],
    ['क', 'कि'],
    ['Bébé', 'Bebe'],
    ['!!!', '???'],
    ['&', 'and'],
  ])(
    'does not match different names through an empty or stripped key: %s / %s',
    async (query, candidate) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          Response.json({ artists: [{ id: TIM_ID, name: candidate }] })
        )
        .mockResolvedValueOnce(Response.json({ id: TIM_ID, name: candidate }));
      await expect(matchMusicBrainzArtistByName(query)).resolves.toEqual({
        status: 'none',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['Bébé', 'Be\u0301be\u0301'],
    ['東京', '東京'],
    ['سلام', 'سلام'],
    ['ＦＯＯ', 'foo'],
  ])(
    'matches canonically equivalent names without losing script identity: %s / %s',
    async (query, candidate) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          Response.json({ artists: [{ id: TIM_ID, name: candidate }] })
        )
        .mockResolvedValueOnce(Response.json({ id: TIM_ID, name: candidate }));
      await expect(matchMusicBrainzArtistByName(query)).resolves.toMatchObject({
        status: 'found',
        artist: { id: TIM_ID, name: candidate },
      });
    }
  );

  it('accepts a merged artist ID only through a verified MusicBrainz canonical redirect', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Object.defineProperties(
        Response.json({ id: TIM_ID, name: 'Tim White' }),
        {
          redirected: { value: true },
          url: {
            value: `https://musicbrainz.org/ws/2/artist/${TIM_ID}?fmt=json`,
          },
        }
      )
    );
    await expect(getMusicBrainzArtist(OTHER_TIM_ID)).resolves.toMatchObject({
      id: TIM_ID,
      name: 'Tim White',
    });
  });

  it.each([
    `https://example.com/ws/2/artist/${TIM_ID}`,
    `http://musicbrainz.org/ws/2/artist/${TIM_ID}`,
    `https://musicbrainz.org/ws/2/recording/${TIM_ID}`,
    `https://musicbrainz.org/ws/2/artist/${OTHER_TIM_ID}`,
    'https://musicbrainz.org/ws/2/artist/invalid-id',
    'not-a-url',
  ])(
    'rejects an artist response with an unverified redirect: %s',
    async url => {
      vi.mocked(fetch).mockResolvedValue(
        Object.defineProperties(
          Response.json({ id: TIM_ID, name: 'Tim White' }),
          {
            redirected: { value: true },
            url: { value: url },
          }
        )
      );
      await expect(getMusicBrainzArtist(OTHER_TIM_ID)).rejects.toMatchObject({
        errorCode: 'INVALID_RESPONSE',
      });
    }
  );

  it.each([
    { id: OTHER_TIM_ID, barcode: '123456789012' },
    { id: TIM_ID, barcode: '999999999999' },
    { id: TIM_ID, barcode: null },
  ])('rejects contradictory release detail identity: %j', async detail => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          releases: [{ id: TIM_ID, title: 'Release', barcode: '123456789012' }],
        })
      )
      .mockResolvedValueOnce(
        Response.json({ ...detail, title: 'Wrong album' })
      );
    await expect(
      lookupMusicBrainzReleaseByBarcode('123456789012')
    ).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
  });

  it('accepts a merged release ID only when its canonical redirect and detail barcode agree', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          releases: [
            { id: OTHER_TIM_ID, title: 'Release', barcode: '123456789012' },
          ],
        })
      )
      .mockResolvedValueOnce(
        Object.defineProperties(
          Response.json({
            id: TIM_ID,
            title: 'Release',
            barcode: '123456789012',
          }),
          {
            redirected: { value: true },
            url: {
              value: `https://musicbrainz.org/ws/2/release/${TIM_ID}?fmt=json`,
            },
          }
        )
      );
    await expect(
      lookupMusicBrainzReleaseByBarcode('123456789012')
    ).resolves.toMatchObject({
      id: TIM_ID,
      barcode: '123456789012',
    });
  });

  it('rejects a null artist ID even when redirect validation also returns no identity', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Object.defineProperties(
        Response.json({ id: null, name: 'Untrusted artist' }),
        {
          redirected: { value: true },
          url: { value: 'https://example.com/untrusted' },
        }
      )
    );
    await expect(getMusicBrainzArtist(TIM_ID)).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
  });

  it('rejects a null release ID even when redirect validation also returns no identity', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          releases: [
            {
              id: TIM_ID,
              barcode: '123456789012',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        Object.defineProperties(
          Response.json({
            id: null,
            title: 'Untrusted release',
            barcode: '123456789012',
          }),
          {
            redirected: { value: true },
            url: { value: 'https://example.com/untrusted' },
          }
        )
      );
    await expect(
      lookupMusicBrainzReleaseByBarcode('123456789012')
    ).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE',
    });
  });
});
