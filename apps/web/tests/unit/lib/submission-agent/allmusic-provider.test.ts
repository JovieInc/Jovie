import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockServerFetch: vi.fn(),
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.mockServerFetch,
}));

function makeResponse(params: { ok?: boolean; html: string }) {
  return {
    ok: params.ok ?? true,
    text: vi.fn().mockResolvedValue(params.html),
  };
}

const canonical = {
  profileId: 'profile-1',
  artistName: 'Test Artist',
  artistBio: 'Bio',
  artistContactEmail: 'artist@example.com',
  replyToEmail: 'artist@example.com',
  release: {
    id: 'release-1',
    title: 'Target Album',
    releaseType: 'album',
    releaseDate: new Date('2026-03-01T00:00:00.000Z'),
    label: 'Label',
    upc: '123456789012',
    totalTracks: 10,
    artworkUrl: 'https://example.com/artwork.jpg',
    genres: ['indie'],
    catalogNumber: 'CAT-001',
  },
  tracks: [],
  pressPhotos: [],
} as const;

describe('AllMusic provider helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips mismatched search results and keeps the canonical AllMusic targets', async () => {
    hoisted.mockServerFetch
      .mockResolvedValueOnce(
        makeResponse({
          html: `
            <a href="https://www.allmusic.com/album/another-record-mw0001">Another Record</a>
            <a href="https://www.allmusic.com/album/target-album-mw0002">Target Album</a>
          `,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          html: `
            <a href="https://www.allmusic.com/artist/test-artist-mn0001">Test Artist</a>
          `,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          html: `
            <meta property="og:title" content="Another Record - Other Artist | Album | AllMusic">
            <script type="application/ld+json">{"name":"Another Record","byArtist":{"name":"Other Artist"}}</script>
          `,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          html: `
            <meta property="og:title" content="Target Album - Test Artist | Album | AllMusic">
            <script type="application/ld+json">{"name":"Target Album","byArtist":{"name":"Test Artist"}}</script>
          `,
        })
      )
      .mockResolvedValueOnce(
        makeResponse({
          html: `
            <meta property="og:title" content="Test Artist | Biography, Music & News | AllMusic">
            <script type="application/ld+json">{"name":"Test Artist"}</script>
          `,
        })
      );

    const { discoverAllMusicTargets } = await import(
      '@/lib/submission-agent/monitoring/providers/allmusic'
    );
    const targets = await discoverAllMusicTargets(canonical);

    expect(targets).toEqual([
      {
        targetType: 'allmusic_release_page',
        canonicalUrl: 'https://www.allmusic.com/album/target-album-mw0002',
      },
      {
        targetType: 'allmusic_artist_page',
        canonicalUrl: 'https://www.allmusic.com/artist/test-artist-mn0001',
      },
    ]);
  });

  it('does not fall back to canonical metadata when the live page omits fields', async () => {
    hoisted.mockServerFetch.mockResolvedValue(
      makeResponse({
        html: `
          <meta property="og:image" content="https://example.com/cover.jpg">
        `,
      })
    );

    const { snapshotAllMusicTarget } = await import(
      '@/lib/submission-agent/monitoring/providers/allmusic'
    );
    const snapshot = await snapshotAllMusicTarget(canonical, {
      targetType: 'allmusic_release_page',
      canonicalUrl: 'https://www.allmusic.com/album/target-album-mw0002',
    });

    expect(snapshot?.normalizedData.releaseTitle).toBeUndefined();
    expect(snapshot?.normalizedData.artistName).toBeUndefined();
    expect(snapshot?.normalizedData.upc).toBeUndefined();
    expect(snapshot?.normalizedData.hasArtwork).toBe(true);
  });
});
