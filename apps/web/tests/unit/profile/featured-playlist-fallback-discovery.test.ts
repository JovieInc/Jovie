import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  return {
    captureWarningMock: vi.fn().mockResolvedValue(undefined),
    searchGoogleCSEMock: vi.fn(),
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: hoisted.captureWarningMock,
}));

vi.mock('@/lib/leads/google-cse', () => ({
  searchGoogleCSE: hoisted.searchGoogleCSEMock,
}));

const VALID_HTML = `
<!doctype html>
<html>
  <head>
    <title>This Is Tim White | Spotify Playlist</title>
    <meta property="og:url" content="https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu" />
    <meta property="og:image" content="https://i.scdn.co/image/playlist" />
  </head>
  <body>
    <script>
      window.__DATA__ = {
        owner: { uri: "spotify:user:spotify", name: "Spotify" },
        items: ["spotify:artist:4Uwpa6zW3zzCSQvooQNksm"]
      };
    </script>
  </body>
</html>
`;

describe('featured playlist fallback discovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    hoisted.captureWarningMock.mockClear();
    hoisted.searchGoogleCSEMock.mockReset();
  });

  it('discovers a candidate from search results and playlist HTML', async () => {
    hoisted.searchGoogleCSEMock.mockResolvedValue([
      {
        link: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        title: 'This Is Tim White',
        snippet: '',
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(VALID_HTML, { status: 200 })
    );

    const { discoverThisIsPlaylistCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback-discovery'
    );

    await expect(
      discoverThisIsPlaylistCandidate({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      })
    ).resolves.toMatchObject({
      artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
      source: 'serp_html',
      title: 'This Is Tim White',
    });
  });

  it('returns null when page fetch fails', async () => {
    hoisted.searchGoogleCSEMock.mockResolvedValue([
      {
        link: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        title: 'This Is Tim White',
        snippet: '',
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

    const { discoverThisIsPlaylistCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback-discovery'
    );

    await expect(
      discoverThisIsPlaylistCandidate({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      })
    ).resolves.toBeNull();
  });
});
