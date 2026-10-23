import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProfileModeAliasAtEdge } from '@/lib/routing/profile-alias-edge';

function aliasRequest(
  path = '/dualipa/listen',
  origin = 'https://jovie-abc123-jovie.vercel.app'
): NextRequest {
  return new NextRequest(new URL(path, origin));
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init?.status ?? 200,
  });
}

describe('resolveProfileModeAliasAtEdge', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('emits the same-origin 307 from a lowercased decision fetch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        creatorUsername: 'dualipa',
        href: '/dualipa?mode=listen',
        kind: 'mode',
      })
    );

    const response = await resolveProfileModeAliasAtEdge(
      aliasRequest(),
      'DualIpa',
      'listen'
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe(
      'https://jovie-abc123-jovie.vercel.app/dualipa?mode=listen'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const decisionUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(decisionUrl.origin).toBe('https://jovie-abc123-jovie.vercel.app');
    expect(decisionUrl.pathname).toBe('/api/profile-alias-decision');
    expect(Object.fromEntries(decisionUrl.searchParams)).toEqual({
      alias: 'listen',
      username: 'dualipa',
    });
  });

  it('keeps supported link/qr sources in the decision key and href', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        creatorUsername: 'dualipa',
        href: '/dualipa?mode=listen&source=qr',
        kind: 'mode',
      })
    );

    const response = await resolveProfileModeAliasAtEdge(
      aliasRequest('/dualipa/listen?source=qr'),
      'dualipa',
      'listen'
    );

    const decisionUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Object.fromEntries(decisionUrl.searchParams)).toEqual({
      alias: 'listen',
      source: 'qr',
      username: 'dualipa',
    });
    expect(response?.headers.get('location')).toContain('source=qr');
  });

  it('never fetches for non-reserved alias slugs', async () => {
    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'downloads')
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', '?source=qr'])(
    'emits a permanent 308 without attribution for a moved decision (%s)',
    async search => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          creatorUsername: 'dualipa',
          href: '/dualipa/renamed-slug',
          kind: 'moved',
        })
      );

      const response = await resolveProfileModeAliasAtEdge(
        aliasRequest(`/dualipa/listen${search}`),
        'dualipa',
        'listen'
      );

      expect(response?.status).toBe(308);
      expect(response?.headers.get('location')).toBe(
        'https://jovie-abc123-jovie.vercel.app/dualipa/renamed-slug'
      );
    }
  );

  it('falls through on content collisions so the resolver page owns them', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ creatorUsername: 'dualipa', kind: 'content' })
    );

    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'music')
    ).resolves.toBeNull();
  });

  it('falls through when the decision endpoint is not ok', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ kind: 'unavailable' }, { status: 503 })
    );

    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'listen')
    ).resolves.toBeNull();
  });

  it('falls through when the decision fetch rejects or times out', async () => {
    fetchMock.mockRejectedValue(new Error('timed out'));

    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'listen')
    ).resolves.toBeNull();
  });

  it('falls through on malformed or non-root-relative hrefs', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ href: 'https://evil.example/dualipa', kind: 'mode' })
    );
    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'listen')
    ).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse({ kind: 'mode' }));
    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'listen')
    ).resolves.toBeNull();
  });

  it('never fetches in test or development environments', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'listen')
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a cold decision fetch alive after the 250ms budget so the next hop is cached', async () => {
    vi.unstubAllGlobals();
    const coldOriginMs = 600;
    const cachedOriginMs = 15;
    let completedResponses = 0;
    const server: Server = createServer((request, response) => {
      const delay = completedResponses === 0 ? coldOriginMs : cachedOriginMs;
      const timer = setTimeout(() => {
        if (response.writableEnded || request.destroyed) return;
        completedResponses += 1;
        response.writeHead(200, {
          // Mirrors the decision endpoint's real header (route.ts).
          'cache-control': 'public, s-maxage=120, stale-while-revalidate=180',
          'content-type': 'application/json',
        });
        response.end(
          JSON.stringify({ href: '/dualipa?mode=listen', kind: 'mode' })
        );
      }, delay);
      // A client abort cancels the origin the way the old 250ms
      // AbortSignal did, so the response is never stored.
      request.on('close', () => {
        if (!response.writableEnded) clearTimeout(timer);
      });
    });
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const origin = `http://127.0.0.1:${port}`;

    try {
      const aborted = new AbortController();
      const abortTimer = setTimeout(() => aborted.abort(), 250);
      const abortedRequest = fetch(
        `${origin}/api/profile-alias-decision?username=dualipa&alias=listen`,
        { signal: aborted.signal }
      );
      await expect(abortedRequest).rejects.toThrow();
      clearTimeout(abortTimer);
      expect(completedResponses).toBe(0);

      const background: Promise<unknown>[] = [];
      const startedAt = performance.now();
      const first = await resolveProfileModeAliasAtEdge(
        aliasRequest('/dualipa/listen', origin),
        'dualipa',
        'listen',
        promise => {
          background.push(promise);
        }
      );
      const firstMs = performance.now() - startedAt;
      expect(first).toBeNull();
      expect(firstMs).toBeGreaterThan(200);
      expect(firstMs).toBeLessThan(500);
      expect(completedResponses).toBe(0);
      await Promise.all(background);
      expect(completedResponses).toBe(1);

      const secondStartedAt = performance.now();
      const second = await resolveProfileModeAliasAtEdge(
        aliasRequest('/dualipa/listen', origin),
        'dualipa',
        'listen'
      );
      const secondMs = performance.now() - secondStartedAt;
      expect(second?.status).toBe(307);
      const location = new URL(second?.headers.get('location') ?? '');
      expect(location.pathname).toBe('/dualipa');
      expect(location.search).toBe('?mode=listen');
      expect(secondMs).toBeLessThan(150);
      expect(completedResponses).toBe(2);
      console.info(
        JSON.stringify({
          abortedAt250MsStored: false,
          coldOriginMs,
          firstNavigationMs: Math.round(firstMs),
          secondNavigationMs: Math.round(secondMs),
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  }, 10_000);

  it('forwards the visitor cookie header for protected deployments', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ href: '/dualipa?mode=listen', kind: 'mode' })
    );

    const request = new NextRequest(
      new URL('https://jovie-abc123-jovie.vercel.app/dualipa/listen'),
      { headers: { cookie: '__vdpl=bypass; other=1' } }
    );
    await resolveProfileModeAliasAtEdge(request, 'dualipa', 'listen');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: { cookie: '__vdpl=bypass; other=1' },
      })
    );
  });
});
