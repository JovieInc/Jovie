import { describe, expect, it } from 'vitest';

import {
  createProfile,
  DEFAULT_BASE_URL,
  type FetchImplementation,
  fetchArtist,
  fetchArtistLlms,
  fetchOpenApi,
  fetchSiteLlms,
  JovieInputError,
  normalizeBaseUrl,
  validateUsername,
} from './client.js';

function createFetch(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
) {
  const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
  const fetchImpl: FetchImplementation = async (input, init) => {
    calls.push({ input, init });
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  };
  return { calls, fetchImpl };
}

describe('Jovie public resource client', () => {
  it('normalizes only deployment origins', () => {
    expect(normalizeBaseUrl()).toBe(DEFAULT_BASE_URL);
    expect(normalizeBaseUrl('https://staging.jov.ie/')).toBe(
      'https://staging.jov.ie'
    );

    const credentialsUrl = ['https://user', ':password@jov.ie'].join('');
    for (const value of [
      'not-a-url',
      'ftp://jov.ie',
      credentialsUrl,
      'https://jov.ie/api',
      'https://jov.ie/?token=secret',
      'https://jov.ie/#private',
    ]) {
      expect(() => normalizeBaseUrl(value)).toThrow(JovieInputError);
    }
  });

  it('accepts the same handle characters as the public profile routes', () => {
    expect(validateUsername('artist.name_1')).toBe('artist.name_1');
    expect(validateUsername('  artist-name  ')).toBe('artist-name');

    for (const value of [
      '',
      'ab',
      'a'.repeat(31),
      'artist/name',
      'artist name',
    ]) {
      expect(() => validateUsername(value)).toThrow(JovieInputError);
    }
  });

  it('fetches the public artist API with GET and no credentials', async () => {
    const { calls, fetchImpl } = createFetch('{"artist":{"username":"demo"}}');

    await expect(
      fetchArtist('demo', { fetchImpl, baseUrl: 'https://staging.jov.ie/' })
    ).resolves.toEqual({ artist: { username: 'demo' } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      input: 'https://staging.jov.ie/api/v1/demo',
      init: {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
    });
    expect(calls[0].init?.headers).not.toHaveProperty('Authorization');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fetches the canonical OpenAPI contract', async () => {
    const { calls, fetchImpl } = createFetch('{"openapi":"3.1.0"}');

    await expect(fetchOpenApi({ fetchImpl })).resolves.toEqual({
      openapi: '3.1.0',
    });
    expect(calls[0].input).toBe('https://jov.ie/api/v1/openapi.json');
    expect(calls[0].init?.headers).toEqual({
      Accept: 'application/json',
      'User-Agent': 'jovie-cli',
    });
  });

  it('fetches site and per-artist llms resources as text', async () => {
    const site = createFetch('# site guide');
    await expect(
      fetchSiteLlms(false, { fetchImpl: site.fetchImpl })
    ).resolves.toBe('# site guide');
    expect(site.calls[0].input).toBe('https://jov.ie/llms.txt');
    expect(site.calls[0].init?.headers).toEqual({
      Accept: 'text/plain',
      'User-Agent': 'jovie-cli',
    });

    const full = createFetch('# full guide');
    await expect(
      fetchSiteLlms(true, { fetchImpl: full.fetchImpl })
    ).resolves.toBe('# full guide');
    expect(full.calls[0].input).toBe('https://jov.ie/llms-full.txt');

    const artist = createFetch('# artist guide');
    await expect(
      fetchArtistLlms('artist.name', { fetchImpl: artist.fetchImpl })
    ).resolves.toBe('# artist guide');
    expect(artist.calls[0].input).toBe('https://jov.ie/artist.name/llms.txt');
  });

  it('reports HTTP failures with bounded response context', async () => {
    const { fetchImpl } = createFetch('not found', 404);

    await expect(fetchArtist('demo', { fetchImpl })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      status: 404,
      responseBody: 'not found',
    });
  });

  it('preserves retry guidance for throttled and unavailable services', async () => {
    const throttled = createFetch('{"error":"Too many requests"}', 429, {
      'Retry-After': '30',
    });
    await expect(
      fetchArtist('demo', { fetchImpl: throttled.fetchImpl })
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 30,
    });

    const unavailable = createFetch(
      '{"error":"Public API temporarily unavailable"}',
      503,
      { 'Retry-After': '30' }
    );
    await expect(
      fetchArtist('demo', { fetchImpl: unavailable.fetchImpl })
    ).rejects.toMatchObject({
      status: 503,
      retryAfterSeconds: 30,
    });
  });

  it('reports malformed JSON instead of returning an untyped value', async () => {
    const { fetchImpl } = createFetch('not json');

    await expect(fetchOpenApi({ fetchImpl })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'GET https://jov.ie/api/v1/openapi.json returned invalid JSON',
    });
  });

  it('wraps transport errors without exposing request internals', async () => {
    const fetchImpl: FetchImplementation = async () => {
      throw new Error('socket unavailable');
    };

    await expect(fetchSiteLlms(false, { fetchImpl })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'GET https://jov.ie/llms.txt failed: socket unavailable',
    });

    const nonErrorFetch: FetchImplementation = async () => {
      throw 'connection closed';
    };
    await expect(
      fetchSiteLlms(false, { fetchImpl: nonErrorFetch })
    ).rejects.toMatchObject({
      message: 'GET https://jov.ie/llms.txt failed: connection closed',
    });
  });

  it('combines a caller cancellation signal with the request timeout', async () => {
    const { calls, fetchImpl } = createFetch('# guide');
    const controller = new AbortController();

    await expect(
      fetchSiteLlms(false, { fetchImpl, signal: controller.signal })
    ).resolves.toBe('# guide');
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].init?.signal).not.toBe(controller.signal);
  });

  it('posts a Spotify artist URL to create a profile', async () => {
    const { calls, fetchImpl } = createFetch(
      '{"username":"demo","claimUrl":"https://jov.ie/demo/claim"}',
      201
    );
    await expect(
      createProfile('https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb', {
        fetchImpl,
        userAgent: 'jovie-cli/1.0.0',
      })
    ).resolves.toEqual({
      username: 'demo',
      claimUrl: 'https://jov.ie/demo/claim',
    });
    expect(calls[0]).toMatchObject({
      input: 'https://jov.ie/api/agents/profiles',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'jovie-cli/1.0.0',
        },
        body: '{"url":"https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb"}',
      },
    });
  });

  it('rejects non-Spotify-artist URLs before any request', () => {
    const { calls, fetchImpl } = createFetch('{}');
    for (const value of [
      'not a url',
      'http://open.spotify.com/artist/abc',
      'https://open.spotify.com/track/abc',
      'https://evilspotify.com/artist/abc',
      'https://instagram.com/artist',
    ]) {
      expect(() => createProfile(value, { fetchImpl })).toThrow(
        JovieInputError
      );
    }
    expect(calls).toHaveLength(0);
  });

  it('reports POST failures with the method and status', async () => {
    const { fetchImpl } = createFetch(
      '{"error":{"code":"RATE_LIMITED"}}',
      429,
      { 'Retry-After': '120' }
    );
    await expect(
      createProfile('https://open.spotify.com/artist/abc', { fetchImpl })
    ).rejects.toMatchObject({
      message: 'POST https://jov.ie/api/agents/profiles returned HTTP 429',
      apiCode: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 120,
    });
  });

  it('parses HTTP-date and invalid Retry-After values', async () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    for (const [header, expected] of [
      [future, expect.any(Number)],
      ['not a date', undefined],
    ] as const) {
      const { fetchImpl } = createFetch('nope', 503, { 'Retry-After': header });
      const error = (await fetchOpenApi({ fetchImpl }).catch(
        (e: unknown) => e
      )) as { retryAfterSeconds?: number; apiCode?: string };
      expect(error.retryAfterSeconds).toEqual(expected);
      expect(error.apiCode).toBeUndefined();
    }
  });
});
