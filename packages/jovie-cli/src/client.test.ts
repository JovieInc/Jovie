import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BASE_URL,
  type FetchImplementation,
  fetchArtist,
  fetchArtistLlms,
  fetchOpenApi,
  fetchSiteLlms,
  JovieRequestError,
  normalizeBaseUrl,
  validateUsername,
} from './client.js';

function createFetch(body: string, status = 200) {
  const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
  const fetchImpl: FetchImplementation = async (input, init) => {
    calls.push({ input, init });
    return new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
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
    ]) {
      expect(() => normalizeBaseUrl(value)).toThrow(JovieRequestError);
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
      expect(() => validateUsername(value)).toThrow(JovieRequestError);
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
    expect(calls[0].init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('fetches site and per-artist llms resources as text', async () => {
    const site = createFetch('# site guide');
    await expect(
      fetchSiteLlms(false, { fetchImpl: site.fetchImpl })
    ).resolves.toBe('# site guide');
    expect(site.calls[0].input).toBe('https://jov.ie/llms.txt');
    expect(site.calls[0].init?.headers).toEqual({ Accept: 'text/plain' });

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
  });
});
