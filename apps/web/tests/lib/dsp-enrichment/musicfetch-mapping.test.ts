/**
 * Unit tests for musicfetch-mapping.ts
 *
 * Covers:
 * - extractMusicFetchLinks: all 11 platforms produce ExtractedLink entries
 * - mapMusicFetchProfileFields: profile field updates + skip-if-existing logic
 * - avatarUrl saved from MusicFetch image.url (bug fix)
 */

// We test the pure mapping functions directly — no server-only imports involved.
// The extractor stubs are passed via the mock at the provider module level.
// But musicfetch-mapping.ts imports from the provider, so we need to mock it.
import { describe, expect, it, vi } from 'vitest';
import type { MusicFetchArtistResult } from '@/lib/dsp-enrichment/providers/musicfetch';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  extractAppleMusicId: (url: string) => {
    const m = /\/artist\/[^/]+\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractDeezerId: (url: string) => {
    const m = /artist\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractTidalId: (url: string) => {
    const m = /artist\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractSoundcloudId: (url: string) => {
    const m = /soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/.exec(url);
    return m?.[1] ?? null;
  },
  extractYoutubeMusicId: (url: string) => {
    const m = /channel\/(UC[a-zA-Z0-9_-]+)/.exec(url);
    return m?.[1] ?? null;
  },
}));

import {
  extractMusicFetchLinks,
  type MusicFetchProfileFieldState,
  mapMusicFetchProfileFields,
} from '@/lib/dsp-enrichment/musicfetch-mapping';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeFullArtistResult(
  overrides: Partial<MusicFetchArtistResult> = {}
): MusicFetchArtistResult {
  return {
    type: 'artist',
    name: 'Test Artist',
    image: { url: 'https://i.scdn.co/image/abc123' },
    bio: 'A great artist.',
    services: {
      appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
      youtube: { url: 'https://www.youtube.com/channel/UCabc' },
      youtubeMusic: { url: 'https://music.youtube.com/channel/UCabc' },
      soundcloud: { url: 'https://soundcloud.com/testartist' },
      deezer: { url: 'https://www.deezer.com/artist/789012' },
      tidal: { url: 'https://tidal.com/browse/artist/345678' },
      amazonMusic: { url: 'https://music.amazon.com/artists/B001TEST' },
      bandcamp: { url: 'https://testartist.bandcamp.com' },
      instagram: { url: 'https://www.instagram.com/testartist' },
      tiktok: { url: 'https://www.tiktok.com/@testartist' },
    },
    ...overrides,
  };
}

function makeEmptyProfile(
  overrides: Partial<MusicFetchProfileFieldState> = {}
): MusicFetchProfileFieldState {
  return {
    spotifyUrl: null,
    spotifyId: null,
    bio: null,
    avatarUrl: null,
    appleMusicUrl: null,
    appleMusicId: null,
    youtubeUrl: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    ...overrides,
  };
}

const SPOTIFY_URL = 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we';
const SIGNAL = 'musicfetch_artist_lookup';

// ─────────────────────────────────────────────────────────────────────────────
// extractMusicFetchLinks — all 11 platforms
// ─────────────────────────────────────────────────────────────────────────────

describe('extractMusicFetchLinks', () => {
  it('extracts all 11 expected platforms when all services are present', () => {
    const artistData = makeFullArtistResult();
    const links = extractMusicFetchLinks(artistData, SPOTIFY_URL, SIGNAL);

    const platformIds = links.map(l => l.platformId);

    expect(platformIds).toContain('spotify');
    expect(platformIds).toContain('apple_music');
    expect(platformIds).toContain('youtube');
    expect(platformIds).toContain('youtube_music');
    expect(platformIds).toContain('soundcloud');
    expect(platformIds).toContain('bandcamp');
    expect(platformIds).toContain('amazon_music');
    expect(platformIds).toContain('tidal');
    expect(platformIds).toContain('deezer');
    expect(platformIds).toContain('instagram');
    expect(platformIds).toContain('tiktok');
  });

  it('produces exactly 11 links (no duplicates) when all services are present', () => {
    const artistData = makeFullArtistResult();
    const links = extractMusicFetchLinks(artistData, SPOTIFY_URL, SIGNAL);
    expect(links).toHaveLength(11);
  });

  it('always includes Spotify using the provided spotifyUrl even if not in services', () => {
    const artistData = makeFullArtistResult({ services: {} });
    const links = extractMusicFetchLinks(artistData, SPOTIFY_URL, SIGNAL);
    expect(links).toHaveLength(1);
    expect(links[0].platformId).toBe('spotify');
    expect(links[0].url).toBe(SPOTIFY_URL);
  });

  it('sets sourcePlatform to musicfetch on all links', () => {
    const links = extractMusicFetchLinks(
      makeFullArtistResult(),
      SPOTIFY_URL,
      SIGNAL
    );
    for (const link of links) {
      expect(link.sourcePlatform).toBe('musicfetch');
    }
  });

  it('includes the signal in evidence for all links', () => {
    const links = extractMusicFetchLinks(
      makeFullArtistResult(),
      SPOTIFY_URL,
      SIGNAL
    );
    for (const link of links) {
      expect(link.evidence?.signals).toContain(SIGNAL);
    }
  });

  it('omits a platform when its URL is missing from services', () => {
    const artistData = makeFullArtistResult({
      services: {
        appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
        // intentionally no instagram, tiktok, amazon, bandcamp
      },
    });
    const links = extractMusicFetchLinks(artistData, SPOTIFY_URL, SIGNAL);
    const platformIds = links.map(l => l.platformId);
    expect(platformIds).not.toContain('instagram');
    expect(platformIds).not.toContain('tiktok');
    expect(platformIds).not.toContain('amazon_music');
    expect(platformIds).not.toContain('bandcamp');
    // Spotify always present (from spotifyUrl arg)
    expect(platformIds).toContain('spotify');
    expect(platformIds).toContain('apple_music');
  });

  it('deduplicates links when the same URL appears twice', () => {
    // If youtube and youtubeMusic point to the same URL, dedup removes one
    const sameUrl = 'https://music.youtube.com/channel/UCabc';
    const artistData = makeFullArtistResult({
      services: {
        youtube: { url: sameUrl },
        youtubeMusic: { url: sameUrl },
      },
    });
    const links = extractMusicFetchLinks(artistData, SPOTIFY_URL, SIGNAL);
    const urls = links.map(l => l.url);
    const uniqueUrls = [...new Set(urls)];
    expect(urls).toHaveLength(uniqueUrls.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapMusicFetchProfileFields — profile field updates
// ─────────────────────────────────────────────────────────────────────────────

describe('mapMusicFetchProfileFields', () => {
  it('sets spotifyUrl when profile has none', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.spotifyUrl).toBe(SPOTIFY_URL);
  });

  it('does not overwrite existing spotifyUrl', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile({
        spotifyUrl: 'https://open.spotify.com/artist/existing',
      }),
      SPOTIFY_URL
    );
    expect(updates.spotifyUrl).toBeUndefined();
  });

  it('sets spotifyId when provided and profile has none', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL,
      '6M2wZ9GZgrQXHCFfjv46we'
    );
    expect(updates.spotifyId).toBe('6M2wZ9GZgrQXHCFfjv46we');
  });

  it('sets appleMusicUrl and appleMusicId when profile has none', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.appleMusicUrl).toBe(
      'https://music.apple.com/us/artist/test/123456'
    );
    expect(updates.appleMusicId).toBe('123456');
  });

  it('does not overwrite appleMusicId when profile already has one', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile({ appleMusicId: 'existing-am-id' }),
      SPOTIFY_URL
    );
    expect(updates.appleMusicId).toBeUndefined();
  });

  it('sets deezerId extracted from URL', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.deezerId).toBe('789012');
  });

  it('sets tidalId extracted from URL', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.tidalId).toBe('345678');
  });

  it('sets soundcloudId (slug) extracted from URL', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.soundcloudId).toBe('testartist');
  });

  it('sets youtubeMusicId extracted from channel URL', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.youtubeMusicId).toBe('UCabc');
  });

  it('sets youtubeUrl from youtube service', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.youtubeUrl).toBe('https://www.youtube.com/channel/UCabc');
  });

  it('falls back to youtubeMusic URL when youtube is not present', () => {
    const artistData = makeFullArtistResult({
      services: {
        youtubeMusic: { url: 'https://music.youtube.com/channel/UCfallback' },
      },
    });
    const updates = mapMusicFetchProfileFields(
      artistData,
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.youtubeUrl).toBe(
      'https://music.youtube.com/channel/UCfallback'
    );
  });

  it('sets bio when profile has none', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult({ bio: 'Artist bio.' }),
      makeEmptyProfile(),
      SPOTIFY_URL
    );
    expect(updates.bio).toBe('Artist bio.');
  });

  it('does not overwrite existing bio', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult({ bio: 'New bio' }),
      makeEmptyProfile({ bio: 'Existing bio' }),
      SPOTIFY_URL
    );
    expect(updates.bio).toBeUndefined();
  });

  it('sets avatarUrl from image.url when profile has no avatar', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult({
        image: { url: 'https://i.scdn.co/image/artist-photo.jpg' },
      }),
      makeEmptyProfile({ avatarUrl: null }),
      SPOTIFY_URL
    );
    expect(updates.avatarUrl).toBe('https://i.scdn.co/image/artist-photo.jpg');
  });

  it('does not set avatarUrl when profile already has one', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult({
        image: { url: 'https://i.scdn.co/image/new-photo.jpg' },
      }),
      makeEmptyProfile({ avatarUrl: 'https://existing-avatar.com/photo.jpg' }),
      SPOTIFY_URL
    );
    expect(updates.avatarUrl).toBeUndefined();
  });

  it('does not set avatarUrl when image.url is missing', () => {
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult({ image: undefined }),
      makeEmptyProfile({ avatarUrl: null }),
      SPOTIFY_URL
    );
    expect(updates.avatarUrl).toBeUndefined();
  });

  it('returns empty updates when all profile fields are already populated', () => {
    const fullyPopulatedProfile: MusicFetchProfileFieldState = {
      spotifyUrl: SPOTIFY_URL,
      spotifyId: 'existing-id',
      bio: 'Existing bio',
      avatarUrl: 'https://existing.com/avatar.jpg',
      appleMusicUrl: 'https://music.apple.com/us/artist/existing/999',
      appleMusicId: 'existing-am-id',
      youtubeUrl: 'https://youtube.com/existing',
      youtubeMusicId: 'UCexisting',
      deezerId: 'existing-deezer',
      tidalId: 'existing-tidal',
      soundcloudId: 'existing-sc',
    };
    const updates = mapMusicFetchProfileFields(
      makeFullArtistResult(),
      fullyPopulatedProfile,
      SPOTIFY_URL
    );
    expect(Object.keys(updates)).toHaveLength(0);
  });
});
