import { describe, expect, it } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import {
  buildLibraryMerchAssets,
  buildLibraryReleaseAssets,
  formatLibraryDuration,
  formatLibraryReleaseDate,
  getLibraryAspectRatioClass,
  getLibraryAssetAspectRatio,
  getLibraryDrawerHeroClass,
  LIBRARY_GRID_DENSITY_LAYOUT,
  normalizeLibraryVersionTitle,
  stackLibraryReleaseVersions,
} from '@/app/app/(shell)/library/library-data';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { LibraryMerchCard } from '@/lib/merch/types';

function buildRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Test Release',
    artistNames: ['Test Artist'],
    status: 'released',
    artworkUrl: 'https://example.com/art.jpg',
    slug: 'test-release',
    smartLinkPath: '/artist/test-release',
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...overrides,
  };
}

describe('library data', () => {
  it('derives read-only assets from release view models', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({
        lyrics: 'Stored lyrics',
        previewUrl: 'https://example.com/preview.mp3',
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com/album/test',
            source: 'ingested',
            updatedAt: '2026-01-01T00:00:00.000Z',
            path: '/artist/test-release/spotify',
            isPrimary: true,
          },
        ],
      }),
    ]);

    expect(assets).toEqual([
      {
        id: 'release-1',
        title: 'Test Release',
        artist: 'Test Artist',
        artworkUrl: 'https://example.com/art.jpg',
        previewUrl: 'https://example.com/preview.mp3',
        videoUrl: null,
        waveformSeed: expect.any(Number),
        smartLinkPath: '/artist/test-release',
        releaseDate: null,
        releaseType: 'single',
        status: 'released',
        approvalStatus: 'draft',
        trackCount: 1,
        providerCount: 1,
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com/album/test',
          },
        ],
        hasLyrics: true,
        hasArtwork: true,
        hasVideoLinks: false,
        assetKinds: ['artwork', 'preview', 'lyrics', 'providers'],
        genres: [],
        spotifyPopularity: null,
        targetPlaylistCount: 0,
        isExplicit: false,
        label: null,
        upc: null,
        distributor: null,
        totalDurationMs: null,
      },
    ]);
  });

  it('maps canvas video URLs and deterministic waveform seeds for scrub previews', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({
        id: 'release-canvas',
        previewUrl: 'https://example.com/preview.mp3',
        canvasVideoUrl: 'https://example.com/canvas.mp4',
      }),
    ]);

    expect(assets[0]).toMatchObject({
      previewUrl: 'https://example.com/preview.mp3',
      videoUrl: 'https://example.com/canvas.mp4',
      waveformSeed: expect.any(Number),
    });
    expect(assets[0]?.waveformSeed).toBeGreaterThan(0);
  });

  it('hides unavailable or invalid media URLs instead of mocking assets', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({
        artworkUrl: '',
        previewUrl: 'javascript:alert(1)',
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: '',
            source: 'ingested',
            updatedAt: '2026-01-01T00:00:00.000Z',
            path: '/artist/test-release/spotify',
            isPrimary: true,
          },
        ],
      }),
    ]);

    expect(assets[0]).toMatchObject({
      artworkUrl: null,
      previewUrl: null,
      providerCount: 0,
      providers: [],
      hasArtwork: false,
      assetKinds: [],
    });
  });

  it('applies persisted approval statuses when building library assets', () => {
    const assets = buildLibraryReleaseAssets(
      [buildRelease()],
      new Map([['release-1', 'approved']])
    );

    expect(assets[0]?.approvalStatus).toBe('approved');
  });

  it('derives library merch assets from chat-selected merch cards', () => {
    const cards: LibraryMerchCard[] = [
      {
        id: 'merch-1',
        status: 'draft',
        title: 'Never Say A Word Hoodie',
        description: 'Black hoodie with cover art.',
        productType: 'hoodie',
        primaryImageUrl: 'https://cdn.example.com/hoodie.png',
        mockupUrls: ['https://cdn.example.com/mockup.png'],
        retailPriceCents: 6800,
        artistPayoutPerUnitEstimateCents: 2200,
        jovieMarginPerUnitEstimateCents: 900,
        rankScore: 91,
        position: 0,
        pinned: false,
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-25T00:00:00.000Z',
        publishedAt: null,
      },
    ];

    expect(buildLibraryMerchAssets(cards, 'Tim White')).toEqual([
      expect.objectContaining({
        id: 'merch-merch-1',
        title: 'Never Say A Word Hoodie',
        artist: 'Tim White',
        artworkUrl: 'https://cdn.example.com/hoodie.png',
        itemKind: 'merch',
        approvalStatus: 'draft',
        itemStatusLabel: 'Draft',
        productType: 'hoodie',
        primaryActionLabel: 'Open Merch',
        smartLinkPath: '/app/library?view=merch',
        salePriceLabel: '$68.00',
        profitLabel: '$22.00',
      }),
    ]);
  });

  it('formats release dates without local timezone drift', () => {
    expect(formatLibraryReleaseDate('2026-04-28T00:00:00.000Z')).toBe(
      'Apr 28, 2026'
    );
    expect(formatLibraryReleaseDate(null)).toBe('No Release Date');
  });

  it('formats duration values with consistent fallbacks and clock formatting', () => {
    expect(formatLibraryDuration(null)).toBe('No Duration');
    expect(formatLibraryDuration(0)).toBe('No Duration');
    expect(formatLibraryDuration(212_000)).toBe('3:32');
    expect(formatLibraryDuration(3_661_000)).toBe('1:01:01');
  });

  it('derives square aspect ratios for releases and merch', () => {
    const releaseAsset = buildLibraryReleaseAssets([buildRelease()])[0];
    const merchAsset = buildLibraryMerchAssets(
      [
        {
          id: 'merch-1',
          status: 'draft',
          title: 'Hoodie',
          description: 'Black hoodie',
          productType: 'hoodie',
          primaryImageUrl: 'https://cdn.example.com/hoodie.png',
          mockupUrls: [],
          retailPriceCents: 6800,
          artistPayoutPerUnitEstimateCents: 2200,
          jovieMarginPerUnitEstimateCents: 900,
          rankScore: 91,
          position: 0,
          pinned: false,
          createdAt: '2026-05-24T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          publishedAt: null,
        },
      ],
      'Tim White'
    )[0];

    expect(getLibraryAssetAspectRatio(releaseAsset)).toBe('1:1');
    expect(getLibraryAssetAspectRatio(merchAsset)).toBe('1:1');
    expect(getLibraryAspectRatioClass('1:1')).toBe('aspect-square');
  });

  it('derives landscape and portrait video aspect ratios', () => {
    const landscapeVideo: LibraryReleaseAsset = {
      id: 'video-landscape',
      title: 'Music Video',
      artist: 'Tim White',
      artworkUrl: 'https://cdn.example.com/video.jpg',
      previewUrl: null,
      smartLinkPath: '/app/library?view=videos',
      releaseDate: null,
      releaseType: 'single',
      status: 'released',
      trackCount: 0,
      providerCount: 0,
      providers: [],
      hasLyrics: false,
      hasArtwork: true,
      hasVideoLinks: true,
      assetKinds: ['artwork', 'video'],
      genres: [],
      spotifyPopularity: null,
      targetPlaylistCount: 0,
      isExplicit: false,
      label: null,
      upc: null,
      distributor: null,
      totalDurationMs: null,
      itemKind: 'video',
    };
    const portraitVideo: LibraryReleaseAsset = {
      ...landscapeVideo,
      id: 'video-portrait',
      title: 'Reel',
      mediaOrientation: 'portrait',
    };

    expect(getLibraryAssetAspectRatio(landscapeVideo)).toBe('16:9');
    expect(getLibraryAssetAspectRatio(portraitVideo)).toBe('9:16');
    expect(getLibraryAspectRatioClass('16:9')).toBe('aspect-video');
    expect(getLibraryAspectRatioClass('9:16')).toBe('aspect-[9/16]');
  });

  it('compacts the drawer hero so large images stay inside the rail', () => {
    // Square / landscape art is width-bound so it cannot exceed the rail width.
    const square = getLibraryDrawerHeroClass('1:1');
    expect(square).toContain('aspect-square');
    expect(square).toContain('max-w-56');
    expect(square).toContain('w-full');

    const landscape = getLibraryDrawerHeroClass('16:9');
    expect(landscape).toContain('aspect-video');
    expect(landscape).toContain('max-w-56');

    // Portrait art is HEIGHT-bound so a tall 9:16 canvas cannot blow out the
    // narrow rail vertically; width derives down from the height cap.
    const portrait = getLibraryDrawerHeroClass('9:16');
    expect(portrait).toContain('aspect-[9/16]');
    expect(portrait).toContain('max-h-72');
    expect(portrait).toContain('w-auto');
    expect(portrait).not.toContain('max-w-56');
  });

  it('exposes density-aware grid layout classes', () => {
    expect(LIBRARY_GRID_DENSITY_LAYOUT.comfortable).toContain(
      'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
    );
    expect(LIBRARY_GRID_DENSITY_LAYOUT.compact).toContain(
      'sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
    );
    expect(LIBRARY_GRID_DENSITY_LAYOUT.spacious).toContain(
      'sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3'
    );
  });
});

describe('library version stacking (JOV-3089)', () => {
  it('normalizes version variant titles to one key', () => {
    expect(normalizeLibraryVersionTitle('All This Noise EP')).toBe(
      'all this noise'
    );
    expect(normalizeLibraryVersionTitle('All This Noise (Remixed)')).toBe(
      'all this noise'
    );
    expect(normalizeLibraryVersionTitle('All This Noise [Deluxe]')).toBe(
      'all this noise'
    );
    expect(normalizeLibraryVersionTitle('All This Noise - Remastered')).toBe(
      'all this noise'
    );
    expect(normalizeLibraryVersionTitle('  All   This   Noise  ')).toBe(
      'all this noise'
    );
    // Distinct titles stay distinct.
    expect(normalizeLibraryVersionTitle('All This Noise')).not.toBe(
      normalizeLibraryVersionTitle('Some Other Song')
    );
  });

  it('stacks near-duplicate ingests and keeps the most complete row', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({
        id: 'sparse',
        title: 'All This Noise EP',
        totalTracks: 0,
        releaseDate: '2026-01-01T00:00:00.000Z',
      }),
      buildRelease({
        id: 'full',
        title: 'All This Noise (Remixed)',
        totalTracks: 6,
        releaseDate: '2026-02-01T00:00:00.000Z',
      }),
      buildRelease({
        id: 'other',
        title: 'Different Song',
        totalTracks: 1,
      }),
    ]);

    const stacked = stackLibraryReleaseVersions(assets);

    expect(stacked.map(asset => asset.id)).toEqual(['full', 'other']);
  });

  it('keeps same-title releases by different artists unstacked', () => {
    const assets = buildLibraryReleaseAssets([
      buildRelease({ id: 'a', title: 'Intro', artistNames: ['Artist A'] }),
      buildRelease({ id: 'b', title: 'Intro', artistNames: ['Artist B'] }),
    ]);

    expect(stackLibraryReleaseVersions(assets)).toHaveLength(2);
  });
});
