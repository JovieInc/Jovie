import { describe, expect, it } from 'vitest';
import {
  buildOnboardingCatalogPreview,
  readOnboardingCatalogPreview,
  toPreviewPublicReleases,
} from './catalog-preview';

const album = (
  id: string,
  releaseDate: string | null,
  albumType = 'single'
) => ({
  id,
  name: `Release ${id}`,
  album_type: albumType,
  release_date: releaseDate,
  images: [{ url: `https://i.scdn.co/image/${id}` }],
  external_urls: { spotify: `https://open.spotify.com/album/${id}` },
});

describe('buildOnboardingCatalogPreview', () => {
  it('merges album and single pages newest first and keeps the true total', () => {
    const preview = buildOnboardingCatalogPreview(
      [
        album('a1', '2025-10-01', 'album'),
        album('s1', '2026-08-14'),
        album('s2', '2026-03-02'),
        album('a2', '2024', 'album'),
      ],
      24
    );
    expect(preview.total).toBe(24);
    expect(preview.releases.map(release => release.id)).toEqual([
      's1',
      's2',
      'a1',
      'a2',
    ]);
    expect(preview.releases[0]).toMatchObject({
      title: 'Release s1',
      releaseType: 'single',
      artworkUrl: 'https://i.scdn.co/image/s1',
      spotifyUrl: 'https://open.spotify.com/album/s1',
    });
  });

  it('caps the preview, drops duplicates and nameless rows', () => {
    const preview = buildOnboardingCatalogPreview(
      [
        album('x', '2026-01-01'),
        album('x', '2026-01-01'),
        { ...album('y', '2025-01-01'), name: '  ' },
        album('z', null),
      ],
      0,
      6
    );
    expect(preview.releases.map(release => release.id)).toEqual(['x', 'z']);
    expect(preview.total).toBe(2);
  });

  it('rejects non-https artwork and non-Spotify album links', () => {
    const [release] = buildOnboardingCatalogPreview(
      [
        {
          ...album('q', '2026-01-01'),
          images: [{ url: 'http://insecure.example/art.jpg' }],
          external_urls: { spotify: 'https://evil.example/album/q' },
        },
      ],
      1
    ).releases;
    expect(release?.artworkUrl).toBeNull();
    expect(release?.spotifyUrl).toBe('https://open.spotify.com/album/q');
  });
});

describe('readOnboardingCatalogPreview', () => {
  it('round-trips a tool output and drops invalid rows', () => {
    const preview = buildOnboardingCatalogPreview(
      [album('s1', '2026-08-14')],
      3
    );
    const read = readOnboardingCatalogPreview({
      ...preview,
      releases: [
        ...preview.releases,
        { id: 'bad', title: 'Bad', spotifyUrl: 'javascript:alert(1)' },
      ],
    });
    expect(read).toEqual(preview);
  });

  it('returns null for missing or malformed payloads', () => {
    expect(readOnboardingCatalogPreview(undefined)).toBeNull();
    expect(readOnboardingCatalogPreview({ releases: 'nope' })).toBeNull();
  });
});

describe('toPreviewPublicReleases', () => {
  it('maps to the public profile release shape', () => {
    const preview = buildOnboardingCatalogPreview(
      [album('s1', '2026-08-14')],
      1
    );
    expect(toPreviewPublicReleases(preview, 'Canary Pianist')).toEqual([
      {
        id: 'onboarding-release-s1',
        title: 'Release s1',
        slug: 's1',
        releaseType: 'single',
        releaseDate: '2026-08-14',
        artworkUrl: 'https://i.scdn.co/image/s1',
        artistNames: ['Canary Pianist'],
      },
    ]);
    expect(toPreviewPublicReleases(null, 'x')).toEqual([]);
  });
});
