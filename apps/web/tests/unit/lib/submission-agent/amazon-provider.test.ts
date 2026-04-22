import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockServerFetch } = vi.hoisted(() => ({
  mockServerFetch: vi.fn(),
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

describe('submission-agent/monitoring/providers/amazon.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns null when the target fetch fails', async () => {
    mockServerFetch.mockResolvedValue({
      ok: false,
    });

    const { snapshotAmazonTarget } = await import(
      '@/lib/submission-agent/monitoring/providers/amazon'
    );

    const result = await snapshotAmazonTarget({} as never, {
      targetType: 'artist',
      canonicalUrl: 'https://music.amazon.com/artists/abc',
    });

    expect(result).toBeNull();
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://music.amazon.com/artists/abc',
      expect.objectContaining({
        context: 'Amazon target fetch (artist)',
        timeoutMs: 8_000,
      })
    );
  });

  it('extracts description and image metadata from the page', async () => {
    mockServerFetch.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`
        <html>
          <head>
            <meta name="description" content="Artist bio summary">
            <meta property="twitter:image" content="https://cdn.example/image.jpg">
          </head>
        </html>
      `),
    });

    const { snapshotAmazonTarget } = await import(
      '@/lib/submission-agent/monitoring/providers/amazon'
    );

    const result = await snapshotAmazonTarget({} as never, {
      targetType: 'artist',
      canonicalUrl: 'https://music.amazon.com/artists/abc',
    });

    expect(result).toEqual({
      targetType: 'artist',
      canonicalUrl: 'https://music.amazon.com/artists/abc',
      normalizedData: {
        hasBio: true,
        hasArtistImage: true,
        hasArtwork: true,
      },
    });
  });
});
