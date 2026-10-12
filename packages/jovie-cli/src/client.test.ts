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
  lookupCreator,
  normalizeBaseUrl,
  readResponseBody,
  reportIssue,
  resolveMusic,
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

  it('looks up a creator with a read-only GET request', async () => {
    const { calls, fetchImpl } = createFetch(
      '{"platform":"youtube","displayName":"Creator"}'
    );

    await expect(
      lookupCreator(' https://www.youtube.com/@creator ', { fetchImpl })
    ).resolves.toEqual({ platform: 'youtube', displayName: 'Creator' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      input:
        'https://jov.ie/api/agents/creator-lookup?url=https%3A%2F%2Fwww.youtube.com%2F%40creator',
      init: { method: 'GET' },
    });
    expect(calls[0].init?.body).toBeUndefined();
  });

  it.each([
    ['youtube:@creator', 'https%3A%2F%2Fwww.youtube.com%2F%40creator'],
    ['youtube:creator', 'https%3A%2F%2Fwww.youtube.com%2F%40creator'],
    [
      'youtube:UCxxxxxxxxxxxxxxxxxxxxxx',
      'https%3A%2F%2Fwww.youtube.com%2Fchannel%2FUCxxxxxxxxxxxxxxxxxxxxxx',
    ],
    ['instagram:creator', 'https%3A%2F%2Fwww.instagram.com%2Fcreator'],
    ['tiktok:creator', 'https%3A%2F%2Fwww.tiktok.com%2F%40creator'],
    ['linktree:creator', 'https%3A%2F%2Flinktr.ee%2Fcreator'],
  ])(
    'expands platform:handle input %s into a canonical lookup URL',
    async (input, encodedUrl) => {
      const { calls, fetchImpl } = createFetch('{"exists":false}');

      await expect(lookupCreator(input, { fetchImpl })).resolves.toBeDefined();

      expect(calls[0].input).toBe(
        `https://jov.ie/api/agents/creator-lookup?url=${encodedUrl}`
      );
    }
  );

  it('rejects malformed platform:handle input before making a request', () => {
    const { calls, fetchImpl } = createFetch('{}');

    for (const value of [
      'youtube:bad handle',
      'youtube:a/b',
      'instagram:@',
      'tiktok:',
      'linktree:ha%cker',
    ]) {
      expect(() => lookupCreator(value, { fetchImpl })).toThrow(
        JovieInputError
      );
    }
    expect(calls).toHaveLength(0);
  });

  it('rejects unsafe creator lookup URLs before making a request', () => {
    const { calls, fetchImpl } = createFetch('{}');
    const credentialedUrl = [
      'https://user',
      ':credential@youtube.com/@creator',
    ].join('');

    for (const value of [
      'not-a-url',
      'http://youtube.com/@creator',
      credentialedUrl,
      `https://youtube.com/@${'x'.repeat(2048)}`,
    ]) {
      expect(() => lookupCreator(value, { fetchImpl })).toThrow(
        JovieInputError
      );
    }
    expect(calls).toHaveLength(0);
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
    let attempts = 0;
    const fetchImpl: FetchImplementation = async () => {
      attempts += 1;
      throw new Error('socket unavailable');
    };

    await expect(fetchSiteLlms(false, { fetchImpl })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'GET https://jov.ie/llms.txt failed: socket unavailable',
    });
    expect(attempts).toBe(3);

    const nonErrorFetch: FetchImplementation = async () => {
      throw 'connection closed';
    };
    await expect(
      fetchSiteLlms(false, { fetchImpl: nonErrorFetch })
    ).rejects.toMatchObject({
      message: 'GET https://jov.ie/llms.txt failed: connection closed',
    });
  });

  it('retries a transient transport failure once', async () => {
    let attempts = 0;
    const fetchImpl: FetchImplementation = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('The operation was aborted due to timeout');
      }
      return new Response('{"artist":{"username":"demo"}}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await expect(fetchArtist('demo', { fetchImpl })).resolves.toEqual({
      artist: { username: 'demo' },
    });
    expect(attempts).toBe(2);
  });

  it('never retries after the caller aborts', async () => {
    let attempts = 0;
    const controller = new AbortController();
    const fetchImpl: FetchImplementation = async () => {
      attempts += 1;
      controller.abort();
      throw new Error('aborted');
    };

    await expect(
      fetchArtist('demo', { fetchImpl, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(attempts).toBe(1);
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
      message:
        'Rate limited by jov.ie. Retry in 120s. (POST https://jov.ie/api/agents/profiles returned HTTP 429)',
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

  it('posts a report with only the provided safe context', async () => {
    const { calls, fetchImpl } = createFetch('{"reportId":"r-1"}', 201);
    await expect(
      reportIssue(
        { kind: 'bug', title: ' broke ', details: ' details ' },
        { cliVersion: '1.0.0', command: undefined, channel: 'cli' },
        { fetchImpl }
      )
    ).resolves.toEqual({ reportId: 'r-1' });
    expect(calls[0].input).toBe('https://jov.ie/api/agents/feedback');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      kind: 'bug',
      title: 'broke',
      details: 'details',
      context: { cliVersion: '1.0.0', channel: 'cli' },
    });
  });

  it('requires a title and details before any request', () => {
    const { calls, fetchImpl } = createFetch('{}');
    expect(() =>
      reportIssue(
        { kind: 'feedback', title: ' ', details: 'x' },
        {},
        { fetchImpl }
      )
    ).toThrow(JovieInputError);
    expect(calls).toHaveLength(0);
  });
});

describe('mutation and stable error contract', () => {
  it('never retries an ambiguously committed POST', async () => {
    let calls = 0;
    const fetchImpl: FetchImplementation = async () => {
      calls++;
      throw new Error('connection lost after commit');
    };
    await expect(
      reportIssue(
        { kind: 'bug', title: 'issue', details: 'details' },
        {},
        { fetchImpl }
      )
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(calls).toBe(1);
  });
  it.each([
    [429, 'RATE_LIMITED'],
    [503, 'RATE_LIMIT_UNAVAILABLE'],
  ])('preserves top-level API code on %s', async (status, code) => {
    const { fetchImpl } = createFetch(
      JSON.stringify({ code, error: 'unavailable' }),
      status
    );
    await expect(fetchArtist('demo', { fetchImpl })).rejects.toMatchObject({
      status,
      apiCode: code,
    });
  });
});

describe('bounded body consumption', () => {
  it('cancels an oversized body', async () => {
    let canceled = false;
    const fetchImpl: FetchImplementation = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(1_048_577));
          },
          cancel() {
            canceled = true;
          },
        })
      );
    await expect(fetchSiteLlms(false, { fetchImpl })).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'Response body exceeds 1 MiB.',
    });
    expect(canceled).toBe(true);
  });
  it('retains deadline after headers and cancels a hanging body', async () => {
    let canceled = false;
    const fetchImpl: FetchImplementation = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        })
      );
    await expect(
      fetchSiteLlms(false, { fetchImpl, timeoutMs: 10 })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(canceled).toBe(true);
  });
  it('cancels body consumption when the caller aborts', async () => {
    const controller = new AbortController();
    let canceled = false;
    const fetchImpl: FetchImplementation = async () => {
      setTimeout(() => controller.abort(), 5);
      return new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        })
      );
    };
    await expect(
      fetchSiteLlms(false, { fetchImpl, signal: controller.signal })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(canceled).toBe(true);
  });
});

describe('response decoding and preexisting cancellation', () => {
  it('rejects an already-aborted response instead of returning an empty success', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readResponseBody(new Response('abc'), controller.signal)
    ).rejects.toThrow('canceled');
    await expect(
      readResponseBody(new Response(null, { status: 204 }), controller.signal)
    ).rejects.toThrow('canceled');
    await expect(
      fetchSiteLlms(false, {
        fetchImpl: async (_url, init) => {
          init?.signal?.dispatchEvent(new Event('abort'));
          controller.abort();
          return new Response('abc');
        },
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
  });
  it('rejects cancellation after headers before reading the body', async () => {
    const controller = new AbortController();
    await expect(
      fetchSiteLlms(false, {
        signal: controller.signal,
        fetchImpl: async () => {
          controller.abort();
          return new Response('abc');
        },
      })
    ).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
  });
  it('decodes UTF8 JSON with a leading BOM like Response.text', async () => {
    const fetchImpl: FetchImplementation = async () =>
      new Response(
        new Uint8Array([
          239,
          187,
          191,
          ...new TextEncoder().encode('{"artist":{"username":"demo"}}'),
        ])
      );
    await expect(fetchArtist('demo', { fetchImpl })).resolves.toEqual({
      artist: { username: 'demo' },
    });
  });
});

describe('music resolution over the existing MCP transport', () => {
  const id = 'jovie-music-resolve';
  const response = (structuredContent: unknown, isError = false) =>
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { structuredContent, isError },
    });

  it('sends a read-only tool call with normalized arguments and MCP Accept headers', async () => {
    const result = {
      status: 'resolved',
      mbid: '51972833-bb04-46b7-9401-45a5ab449ebd',
      artistMetadata: { isnis: ['0000000427529721'] },
    };
    const { calls, fetchImpl } = createFetch(response(result));
    await expect(
      resolveMusic(
        '  us-abc-12-34567  ',
        { kind: 'track', territory: 'gb', artist: '  Tim White  ' },
        { fetchImpl }
      )
    ).resolves.toEqual(result);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe('https://jov.ie/api/music/mcp');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toMatchObject({
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: 'resolve',
        arguments: {
          input: 'us-abc-12-34567',
          kind: 'track',
          territory: 'GB',
          artist: 'Tim White',
        },
      },
    });
  });

  it('defaults to an artist read and preserves ambiguity as a successful result', async () => {
    const result = {
      status: 'ambiguous',
      links: [],
      candidates: [
        {
          title: 'Tim White',
          url: 'https://musicbrainz.org/artist/51972833-bb04-46b7-9401-45a5ab449ebd',
        },
      ],
    };
    const { calls, fetchImpl } = createFetch(response(result));
    await expect(resolveMusic('Tim White', {}, { fetchImpl })).resolves.toEqual(
      result
    );
    expect(JSON.parse(String(calls[0]?.init?.body)).params.arguments).toEqual({
      kind: 'artist',
      input: 'Tim White',
    });
  });

  it.each([
    ['', {}],
    ['a'.repeat(501), {}],
    ['Tim White', { kind: 'creator' }],
    ['Title', { artist: '' }],
    ['Title', { artist: 'a'.repeat(201) }],
    ['Title', { territory: 'USA' }],
  ])(
    'rejects invalid CLI arguments before networking: %s %j',
    async (input, flags) => {
      const { calls, fetchImpl } = createFetch('{}');
      await expect(
        resolveMusic(input, flags, { fetchImpl })
      ).rejects.toBeInstanceOf(JovieInputError);
      expect(calls).toEqual([]);
    }
  );

  it.each([
    null,
    {},
    { jsonrpc: '2.0', id, result: { structuredContent: 'invalid' } },
    { jsonrpc: '2.0', id, result: { structuredContent: [] } },
    { jsonrpc: '1.0', id, result: { structuredContent: {} } },
    { jsonrpc: '2.0', id: 'other', result: { structuredContent: {} } },
    { jsonrpc: '2.0', id, error: { message: 'private' } },
    { jsonrpc: '2.0', id, result: {} },
  ])(
    'rejects malformed MCP envelopes without echoing their payloads: %j',
    async envelope => {
      const { fetchImpl } = createFetch(JSON.stringify(envelope));
      await expect(
        resolveMusic('Tim White', {}, { fetchImpl })
      ).rejects.toMatchObject({
        apiCode: 'INVALID_RESPONSE',
        retryable: false,
      });
    }
  );

  it('retains stable resolver errors and retry advice from HTTP 200 tool errors', async () => {
    const { fetchImpl } = createFetch(
      response({ error: { code: 'UPSTREAM_FAILURE', retryable: true } }, true)
    );
    await expect(
      resolveMusic('Tim White', {}, { fetchImpl })
    ).rejects.toMatchObject({ apiCode: 'UPSTREAM_FAILURE', retryable: true });
    const malformed = createFetch(
      response(
        { error: { code: 'Bearer private-token', retryable: 'true' } },
        true
      )
    );
    await expect(
      resolveMusic('Tim White', {}, { fetchImpl: malformed.fetchImpl })
    ).rejects.toMatchObject({ apiCode: 'RESOLUTION_FAILED', retryable: false });
    const missing = createFetch(response({}, true));
    await expect(
      resolveMusic('Tim White', {}, { fetchImpl: missing.fetchImpl })
    ).rejects.toMatchObject({ apiCode: 'RESOLUTION_FAILED' });
  });
});
