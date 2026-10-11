import { describe, expect, it } from 'vitest';
import { applyPlaylistContext } from '@/lib/discography/playlist-context';

const TRACK_URL = 'https://open.spotify.com/track/0RgcOUQg4qYAEt9RIdf3oB';
const PLAYLIST_ID = '37i9dQZF1DZ06evO2QxIuk';
const PLAYLIST_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;

describe('applyPlaylistContext', () => {
  describe('spotify', () => {
    it('opens a track inside the playlist context', () => {
      expect(
        applyPlaylistContext('spotify', TRACK_URL, {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBe(`${TRACK_URL}?context=spotify:playlist:${PLAYLIST_ID}`);
    });

    it('accepts a full playlist URL as the configured playlist', () => {
      expect(
        applyPlaylistContext('spotify', TRACK_URL, {
          spotifyPlaylist: `${PLAYLIST_URL}?si=abc123`,
        })
      ).toBe(`${TRACK_URL}?context=spotify:playlist:${PLAYLIST_ID}`);
    });

    it('accepts a spotify:playlist URI', () => {
      expect(
        applyPlaylistContext('spotify', TRACK_URL, {
          spotifyPlaylist: `spotify:playlist:${PLAYLIST_ID}`,
        })
      ).toBe(`${TRACK_URL}?context=spotify:playlist:${PLAYLIST_ID}`);
    });

    it('preserves existing query params and replaces a stale context', () => {
      const url = `${TRACK_URL}?si=xyz&context=spotify:playlist:aaaaaaaaaaaaaaaaaaaaaa`;
      expect(
        applyPlaylistContext('spotify', url, {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBe(`${TRACK_URL}?si=xyz&context=spotify:playlist:${PLAYLIST_ID}`);
    });

    it('supports intl-prefixed track paths', () => {
      expect(
        applyPlaylistContext(
          'spotify',
          'https://open.spotify.com/intl-de/track/0RgcOUQg4qYAEt9RIdf3oB',
          { spotifyPlaylist: PLAYLIST_ID }
        )
      ).toBe(
        `https://open.spotify.com/intl-de/track/0RgcOUQg4qYAEt9RIdf3oB?context=spotify:playlist:${PLAYLIST_ID}`
      );
    });

    it('leaves album and artist URLs unchanged', () => {
      const albumUrl = 'https://open.spotify.com/album/0RgcOUQg4qYAEt9RIdf3oB';
      expect(
        applyPlaylistContext('spotify', albumUrl, {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBe(albumUrl);
    });

    it('returns the track URL unchanged when no playlist is configured', () => {
      expect(applyPlaylistContext('spotify', TRACK_URL, null)).toBe(TRACK_URL);
      expect(applyPlaylistContext('spotify', TRACK_URL, {})).toBe(TRACK_URL);
    });

    it('returns the track URL unchanged for a malformed playlist id', () => {
      expect(
        applyPlaylistContext('spotify', TRACK_URL, {
          spotifyPlaylist: 'not-a-playlist',
        })
      ).toBe(TRACK_URL);
    });

    it('returns malformed track URLs unchanged', () => {
      expect(
        applyPlaylistContext('spotify', 'not a url', {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBe('not a url');
    });
  });

  describe('apple_music', () => {
    const APPLE_TRACK =
      'https://music.apple.com/us/album/song-name/1035047659?i=1035048414';
    const APPLE_PLAYLIST =
      'https://music.apple.com/us/playlist/artist-essentials/pl.u-abc123';

    it('opens the song inside the playlist via the i param', () => {
      expect(
        applyPlaylistContext('apple_music', APPLE_TRACK, {
          appleMusicPlaylistUrl: APPLE_PLAYLIST,
        })
      ).toBe(`${APPLE_PLAYLIST}?i=1035048414`);
    });

    it('falls back to the track URL when it has no song id param', () => {
      const noSongId = 'https://music.apple.com/us/album/name/1035047659';
      expect(
        applyPlaylistContext('apple_music', noSongId, {
          appleMusicPlaylistUrl: APPLE_PLAYLIST,
        })
      ).toBe(noSongId);
    });

    it('falls back when the configured playlist is not an Apple Music playlist', () => {
      expect(
        applyPlaylistContext('apple_music', APPLE_TRACK, {
          appleMusicPlaylistUrl: PLAYLIST_URL,
        })
      ).toBe(APPLE_TRACK);
    });
  });

  describe('other providers', () => {
    it('returns the plain track URL unchanged', () => {
      const youtube = 'https://music.youtube.com/watch?v=abc';
      expect(
        applyPlaylistContext('youtube_music', youtube, {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBe(youtube);
    });

    it('handles null and undefined urls', () => {
      expect(
        applyPlaylistContext('spotify', null, { spotifyPlaylist: PLAYLIST_ID })
      ).toBeNull();
      expect(
        applyPlaylistContext('spotify', undefined, {
          spotifyPlaylist: PLAYLIST_ID,
        })
      ).toBeNull();
    });
  });
});
