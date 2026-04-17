import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('featured playlist fallback web helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes canonical and embed Spotify playlist URLs', async () => {
    const { normalizeSpotifyPlaylistUrl } = await import(
      '@/lib/profile/featured-playlist-fallback-web'
    );

    expect(
      normalizeSpotifyPlaylistUrl(
        'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu?si=abc'
      )
    ).toEqual({
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
    });
    expect(
      normalizeSpotifyPlaylistUrl(
        'https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO2SKVTu'
      )
    ).toEqual({
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
    });
    expect(
      normalizeSpotifyPlaylistUrl('https://example.com/playlist/invalid')
    ).toBeNull();
  });

  it('validates a Spotify-owned page with an exact title and matching artist URI', async () => {
    const { validateThisIsPlaylistPage } = await import(
      '@/lib/profile/featured-playlist-fallback-web'
    );

    expect(
      validateThisIsPlaylistPage({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
        html: VALID_HTML,
        playlistId: '37i9dQZF1DZ06evO2SKVTu',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
      })
    ).toEqual({
      imageUrl: 'https://i.scdn.co/image/playlist',
      playlistId: '37i9dQZF1DZ06evO2SKVTu',
      title: 'This Is Tim White',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
    });
  });

  it('rejects near-match titles, non-Spotify owners, and missing artist URIs', async () => {
    const { validateThisIsPlaylistPage } = await import(
      '@/lib/profile/featured-playlist-fallback-web'
    );

    expect(
      validateThisIsPlaylistPage({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
        html: VALID_HTML.replace(
          'This Is Tim White | Spotify Playlist',
          'This Is Tim White Radio | Spotify Playlist'
        ),
        playlistId: '37i9dQZF1DZ06evO2SKVTu',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
      })
    ).toBeNull();
    expect(
      validateThisIsPlaylistPage({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
        html: VALID_HTML.replace(
          'spotify:user:spotify',
          'spotify:user:notspotify'
        ),
        playlistId: '37i9dQZF1DZ06evO2SKVTu',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
      })
    ).toBeNull();
    expect(
      validateThisIsPlaylistPage({
        artistName: 'Tim White',
        artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
        html: VALID_HTML.replace(
          'spotify:artist:4Uwpa6zW3zzCSQvooQNksm',
          'spotify:artist:0000000000000000000000'
        ),
        playlistId: '37i9dQZF1DZ06evO2SKVTu',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
      })
    ).toBeNull();
  });
});
