import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  resolve: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/music-resolver/public-read', () => ({
  resolvePublicMusic: mocks.resolve,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/rate-limit', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...original, publicArtistApiLimiter: { limit: mocks.limit } };
});

import { BASE_URL } from '@/constants/app';
import { MUSIC_READ_TIMEOUT_MS } from '@/lib/music-resolver/public-execution';
import { expectPublicOpenApiResponse } from '@/tests/utils/public-openapi';
import { POST } from './route';

const path = '/api/v1/music/resolve';
const request = (body: unknown = { input: 'Tim White' }, headers = {}) =>
  new Request(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const noMatch = {
  status: 'no_match',
  kind: 'artist',
  title: null,
  artist: null,
  isrc: null,
  upc: null,
  mbid: null,
  links: [],
  candidates: [],
  confidence: 0,
  provenance: {},
  candidateCount: 0,
};

async function checked(response: Response) {
  await expectPublicOpenApiResponse(path, 'post', response);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers.get('Link')).toContain('deprecation');
  expect(response.headers.get('RateLimit-Policy')).toBe(
    '"public-artist";q=100;w=60'
  );
  return response.json();
}

describe('versioned public music resolve HTTP contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.limit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
    mocks.resolve.mockResolvedValue(noMatch);
  });
  afterEach(() => vi.useRealTimers());

  it('uses shared defaults, stable facts, current quota headers and a fresh trace ID', async () => {
    const response = await POST(
      request(undefined, { 'X-Request-Id': 'untrusted' })
    );
    expect(response.status).toBe(200);
    expect(await checked(response)).toEqual(noMatch);
    expect(response.headers.get('RateLimit')).toMatch(
      /^"public-artist";r=99;t=\d+$/
    );
    expect(mocks.resolve).toHaveBeenCalledWith(
      { input: 'Tim White', kind: 'artist' },
      expect.any(AbortSignal)
    );
    const second = await POST(request());
    expect(second.headers.get('X-Request-Id')).not.toBe(
      response.headers.get('X-Request-Id')
    );
  });

  it.each([
    {},
    { input: '' },
    { input: 'x', kind: 'creator' },
    { input: 'x', territory: 'USA' },
    { input: 'x', token: 'private' },
    { input: 'x', fields: ['name'] },
    { input: 'x', maxCharge: 100 },
    { input: 'x', idempotencyKey: 'not-supported' },
  ])(
    'rejects unsupported/invalid arguments before provider work: %j',
    async body => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await checked(response)).toEqual({
        error: { code: 'INVALID_INPUT', retryable: false },
      });
      expect(mocks.resolve).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['INVALID_INPUT', false, 400],
    ['CANCELLED', false, 499],
    ['UPSTREAM_FAILURE', true, 502],
    ['UPSTREAM_TIMEOUT', true, 504],
  ] as const)(
    'maps %s to HTTP %s without wrapping it as success',
    async (code, retryable, status) => {
      mocks.resolve.mockResolvedValue({ error: { code, retryable } });
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await checked(response)).toEqual({ error: { code, retryable } });
      expect(response.headers.get('Retry-After')).toBe(retryable ? '60' : null);
    }
  );

  it.each(['throw', 'unavailable', 'limited'])(
    'fails closed before provider work when quota is %s',
    async state => {
      if (state === 'throw')
        mocks.limit.mockRejectedValue(new Error('private-store-url'));
      else
        mocks.limit.mockResolvedValue({
          success: false,
          unavailable: state === 'unavailable',
          limit: 100,
          remaining: 0,
          reset: new Date(Date.now() + 60_000),
        });
      const response = await POST(request());
      expect(response.status).toBe(state === 'limited' ? 429 : 503);
      expect(await checked(response)).toEqual({
        error: {
          code: state === 'limited' ? 'RATE_LIMITED' : 'RATE_LIMIT_UNAVAILABLE',
          retryable: true,
        },
      });
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(mocks.resolve).not.toHaveBeenCalled();
    }
  );

  it('rejects hostile origins and non-JSON bodies with structured errors', async () => {
    const denied = await POST(
      request(undefined, { Origin: 'https://untrusted.example' })
    );
    expect(denied.status).toBe(403);
    expect(await checked(denied)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(mocks.limit).not.toHaveBeenCalled();
    const media = await POST(
      request(undefined, { 'Content-Type': 'text/plain' })
    );
    expect(media.status).toBe(415);
    expect(await checked(media)).toMatchObject({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'bounds body bytes with Content-Length present=%s',
    async declared => {
      const response = await POST(
        request(
          { input: 'x'.repeat(17000) },
          declared ? { 'Content-Length': '17000' } : {}
        )
      );
      expect(response.status).toBe(413);
      expect(await checked(response)).toMatchObject({
        error: { code: 'PAYLOAD_TOO_LARGE' },
      });
      expect(mocks.resolve).not.toHaveBeenCalled();
    }
  );

  it('redacts malformed JSON and query strings from diagnostics and HTTP', async () => {
    const response = await POST(
      new Request(`${BASE_URL}${path}?secret=private-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"private-body":',
      })
    );
    expect(response.status).toBe(400);
    expect(await checked(response)).toEqual({
      error: { code: 'INVALID_BODY', retryable: false },
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toMatch(
      /private-query|private-body/
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('bounds stalled request streams and cancels their reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const pending = POST(
      new Request(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: new ReadableStream({ start() {}, cancel }),
        duplex: 'half',
      } as RequestInit)
    );
    await vi.advanceTimersByTimeAsync(5_001);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await checked(response)).toMatchObject({
      error: { code: 'BODY_TIMEOUT', retryable: true },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it.each(['deadline', 'disconnect'])(
    'aborts provider work on %s and never retries in the adapter',
    async reason => {
      vi.useFakeTimers();
      const controller = new AbortController();
      mocks.resolve.mockImplementation(() => new Promise(() => {}));
      const req = request();
      const pending = POST(new Request(req, { signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(10);
      const signal = mocks.resolve.mock.calls[0][1] as AbortSignal;
      if (reason === 'deadline')
        await vi.advanceTimersByTimeAsync(MUSIC_READ_TIMEOUT_MS);
      else controller.abort();
      const response = await pending;
      expect(signal.aborted).toBe(true);
      expect(response.status).toBe(reason === 'deadline' ? 504 : 499);
      expect(await checked(response)).toMatchObject({
        error: {
          code: reason === 'deadline' ? 'UPSTREAM_TIMEOUT' : 'CANCELLED',
          retryable: reason === 'deadline',
        },
      });
      expect(mocks.resolve).toHaveBeenCalledOnce();
    }
  );

  it.each(['throws', 'invalid output'])(
    'returns an upstream error when a provider %s, never private material',
    async state => {
      if (state === 'throws')
        mocks.resolve.mockRejectedValue(new Error('private-provider-data'));
      else
        mocks.resolve.mockResolvedValue({
          ...noMatch,
          access_token: 'private-provider-data',
        });
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect(await checked(response)).toEqual({
        error: { code: 'UPSTREAM_FAILURE', retryable: true },
      });
      expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
        'private-provider-data'
      );
    }
  );
});
