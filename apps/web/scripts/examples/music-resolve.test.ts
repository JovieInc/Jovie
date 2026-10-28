import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ limit: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/music-resolver/public-read', () => ({
  resolvePublicMusic: mocks.resolve,
}));
vi.mock('@/lib/rate-limit', () => ({
  publicArtistApiLimiter: { limit: mocks.limit },
  getClientIP: () => '192.0.2.1',
  createRateLimitHeaders: () => ({}),
}));

import { POST } from '@/app/api/v1/music/resolve/route';
import { resolveMusicV1 } from './music-resolve';

const run = promisify(execFile);
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

describe('public music client examples against the actual HTTP adapter', () => {
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const response = await POST(
        new Request(`https://jov.ie${incoming.url}`, {
          method: incoming.method,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.concat(chunks),
        })
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    })().catch(() => {
      outgoing.writeHead(500);
      outgoing.end();
    });
  });
  let baseUrl: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue({ success: true });
    mocks.resolve.mockResolvedValue(noMatch);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test listener');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  });

  it('executes the Python subprocess with a real HTTP request and honest absence', async () => {
    const result = await run(
      'python3',
      [
        fileURLToPath(new URL('./music-resolve.py', import.meta.url)),
        'No Such Artist',
        '--base-url',
        baseUrl,
      ],
      { timeout: 10_000 }
    );
    expect(JSON.parse(result.stdout)).toEqual(noMatch);
    expect(result.stderr).toBe('');
    expect(mocks.resolve).toHaveBeenCalledWith(
      { input: 'No Such Artist', kind: 'artist' },
      expect.any(AbortSignal)
    );
  });

  it('makes the Python CLI exit nonzero on a structured retryable failure', async () => {
    mocks.resolve.mockResolvedValue({
      error: { code: 'UPSTREAM_FAILURE', retryable: true },
    });
    await expect(
      run(
        'python3',
        [
          fileURLToPath(new URL('./music-resolve.py', import.meta.url)),
          'Tim White',
          '--base-url',
          baseUrl,
        ],
        { timeout: 10_000 }
      )
    ).rejects.toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringContaining('UPSTREAM_FAILURE (HTTP 502'),
    });
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });

  it('makes TypeScript failures actionable without implicitly replaying a read', async () => {
    mocks.resolve.mockResolvedValue({
      error: { code: 'UPSTREAM_FAILURE', retryable: true },
    });
    await expect(
      resolveMusicV1({ input: 'Tim White' }, baseUrl)
    ).rejects.toThrow(
      /UPSTREAM_FAILURE \(HTTP 502, retryable=true, request=[0-9a-f-]+, retryAfter=60\)/
    );
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });
});
