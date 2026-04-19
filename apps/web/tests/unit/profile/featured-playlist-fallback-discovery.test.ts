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

  it('escapes quotes in artist names before querying Google CSE', async () => {
    hoisted.searchGoogleCSEMock.mockResolvedValue([]);

    const { discoverThisIsPlaylistCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback-discovery'
    );

    await expect(
      discoverThisIsPlaylistCandidate({
        artistName: 'Tim "TJ" White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      })
    ).resolves.toBeNull();

    expect(hoisted.searchGoogleCSEMock).toHaveBeenCalledWith(
      'site:open.spotify.com/playlist "This Is Tim TJ White"',
      1
    );
  });

  it('returns null and captures a warning when Google CSE throws', async () => {
    hoisted.searchGoogleCSEMock.mockRejectedValue(new Error('search failed'));

    const { discoverThisIsPlaylistCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback-discovery'
    );

    await expect(
      discoverThisIsPlaylistCandidate({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      })
    ).resolves.toBeNull();

    expect(hoisted.captureWarningMock).toHaveBeenCalledWith(
      'Google CSE discovery failed',
      expect.any(Error),
      expect.objectContaining({
        query: 'site:open.spotify.com/playlist "This Is Tim White"',
        route: 'featured-playlist-fallback-discovery',
      })
    );
  });

  it('does not capture a warning for expected 404 playlist responses', async () => {
    hoisted.searchGoogleCSEMock.mockResolvedValue([
      {
        link: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        title: 'This Is Tim White',
        snippet: '',
      },
    ]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 404 })
    );

    const { discoverThisIsPlaylistCandidate } = await import(
      '@/lib/profile/featured-playlist-fallback-discovery'
    );

    await expect(
      discoverThisIsPlaylistCandidate({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
      })
    ).resolves.toBeNull();

    expect(hoisted.captureWarningMock).not.toHaveBeenCalled();
  });
});
