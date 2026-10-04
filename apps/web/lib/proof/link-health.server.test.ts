import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  checkLinkHealth,
  checkLinksHealth,
  MAX_LINKS,
} from './link-health.server';

function response(status: number, location?: string): Response {
  return new Response(null, {
    status,
    headers: location ? { location } : {},
  });
}

const publicHost = async () => 'public' as const;

describe('link health', () => {
  it('follows redirects to a live page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(301, 'https://cdn.example/song'))
      .mockResolvedValueOnce(response(200));
    await expect(
      checkLinkHealth('https://short.example/x', {
        fetchImpl,
        hostCheck: publicHost,
      })
    ).resolves.toMatchObject({
      status: 'ok',
      finalUrl: 'https://cdn.example/song',
    });
  });

  it('marks 404/410 and missing hosts dead, homepage landings redirected', async () => {
    await expect(
      checkLinkHealth('https://a.example/x', {
        fetchImpl: vi.fn().mockResolvedValue(response(404)),
        hostCheck: publicHost,
      })
    ).resolves.toMatchObject({ status: 'dead', httpStatus: 404 });
    await expect(
      checkLinkHealth('https://gone.example/x', {
        fetchImpl: vi.fn(),
        hostCheck: async () => 'missing',
      })
    ).resolves.toMatchObject({ status: 'dead' });
    await expect(
      checkLinkHealth('https://a.example/release', {
        fetchImpl: vi
          .fn()
          .mockResolvedValueOnce(response(302, 'https://other.example/'))
          .mockResolvedValueOnce(response(200)),
        hostCheck: publicHost,
      })
    ).resolves.toMatchObject({ status: 'homepage-redirect' });
  });

  it('never calls bot walls, server errors, private hosts or failures dead', async () => {
    for (const status of [403, 429, 500]) {
      await expect(
        checkLinkHealth('https://a.example/x', {
          fetchImpl: vi.fn().mockResolvedValue(response(status)),
          hostCheck: publicHost,
        })
      ).resolves.toMatchObject({ status: 'unknown' });
    }
    const fetchImpl = vi.fn();
    await expect(
      checkLinkHealth('http://10.0.0.1/x', {
        fetchImpl,
        hostCheck: async () => 'private',
      })
    ).resolves.toMatchObject({ status: 'unknown' });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(
      checkLinkHealth('https://a.example/x', {
        fetchImpl: vi.fn().mockRejectedValue(new Error('timeout')),
        hostCheck: publicHost,
      })
    ).resolves.toMatchObject({ status: 'unknown' });
  });

  it('falls back to GET when HEAD is refused', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(405))
      .mockResolvedValueOnce(response(200));
    await expect(
      checkLinkHealth('https://a.example/x', {
        fetchImpl,
        hostCheck: publicHost,
      })
    ).resolves.toMatchObject({ status: 'ok' });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('checks at most MAX_LINKS distinct links', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const urls = Array.from(
      { length: MAX_LINKS + 5 },
      (_, index) => `https://a.example/${index}`
    );
    const results = await checkLinksHealth([...urls, urls[0] as string], {
      fetchImpl,
      hostCheck: publicHost,
    });
    expect(results).toHaveLength(MAX_LINKS);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_LINKS);
  });
});
