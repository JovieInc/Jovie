import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDiscoverAllMusicTargets } = vi.hoisted(() => ({
  mockDiscoverAllMusicTargets: vi.fn(),
}));

vi.mock('@/lib/submission-agent/monitoring/providers/allmusic', () => ({
  discoverAllMusicTargets: mockDiscoverAllMusicTargets,
}));

describe('submission-agent/monitoring/discovery.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns only new AllMusic targets for the Xperi provider', async () => {
    mockDiscoverAllMusicTargets.mockResolvedValue([
      {
        targetType: 'artist',
        canonicalUrl: 'https://allmusic.example/artist/dua-lipa',
      },
      {
        targetType: 'album',
        canonicalUrl: 'https://allmusic.example/album/future-nostalgia',
      },
    ]);

    const { discoverSubmissionTargets } = await import(
      '@/lib/submission-agent/monitoring/discovery'
    );

    const result = await discoverSubmissionTargets({
      providerId: 'xperi_allmusic_email',
      canonical: {
        artistName: 'Dua Lipa',
      } as never,
      existingTargets: [
        {
          targetType: 'artist',
          canonicalUrl: 'https://allmusic.example/artist/dua-lipa',
        },
      ],
    });

    expect(mockDiscoverAllMusicTargets).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        targetType: 'album',
        canonicalUrl: 'https://allmusic.example/album/future-nostalgia',
      },
    ]);
  });

  it('skips discovery for unsupported providers', async () => {
    const { discoverSubmissionTargets } = await import(
      '@/lib/submission-agent/monitoring/discovery'
    );

    const result = await discoverSubmissionTargets({
      providerId: 'musicbrainz_authenticated_edit',
      canonical: {} as never,
      existingTargets: [],
    });

    expect(result).toEqual([]);
    expect(mockDiscoverAllMusicTargets).not.toHaveBeenCalled();
  });
});
