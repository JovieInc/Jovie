import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildProfileAliasDecisionUrl,
  resolveProfileModeAliasAtEdge,
} from '@/lib/routing/profile-alias-edge';

function aliasRequest(
  path = '/dualipa/listen',
  origin = 'https://jovie-abc123-jovie.vercel.app'
): NextRequest {
  return new NextRequest(new URL(path, origin));
}

function decisionEndpoint(
  params: Record<string, string>,
  origin = 'https://jovie-abc123-jovie.vercel.app'
): string {
  return `${origin}/api/profile-alias-decision?${new URLSearchParams(params).toString()}`;
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
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      decisionEndpoint({ alias: 'listen', username: 'dualipa' })
    );
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

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      decisionEndpoint({ alias: 'listen', source: 'qr', username: 'dualipa' })
    );
    expect(response?.headers.get('location')).toContain('source=qr');
  });

  it('never fetches for non-reserved alias slugs', async () => {
    await expect(
      resolveProfileModeAliasAtEdge(aliasRequest(), 'dualipa', 'downloads')
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits a permanent 308 for a moved decision', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        creatorUsername: 'dualipa',
        href: '/dualipa/renamed-slug',
        kind: 'moved',
      })
    );

    const response = await resolveProfileModeAliasAtEdge(
      aliasRequest(),
      'dualipa',
      'listen'
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get('location')).toBe(
      'https://jovie-abc123-jovie.vercel.app/dualipa/renamed-slug'
    );
    expect(
      (
        await resolveProfileModeAliasAtEdge(
          aliasRequest('/dualipa/listen?source=qr'),
          'dualipa',
          'listen'
        )
      )?.headers.get('location')
    ).toContain('source=qr');
  });

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
