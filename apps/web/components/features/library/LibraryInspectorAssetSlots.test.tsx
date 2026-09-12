import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryInspectorAssetSlots } from './LibraryInspectorAssetSlots';

function asset(overrides: Partial<LibraryReleaseAsset> = {}) {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    previewUrl: null,
    videoUrl: null,
    waveformSeed: 1,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: null,
    releaseType: 'single',
    status: 'released',
    approvalStatus: 'draft',
    profileVisibility: 'visible',
    trackCount: 1,
    providerCount: 0,
    providers: [],
    hasLyrics: false,
    hasArtwork: true,
    hasVideoLinks: false,
    assetKinds: ['artwork'],
    genres: [],
    spotifyPopularity: null,
    targetPlaylistCount: 0,
    isExplicit: false,
    label: null,
    upc: null,
    distributor: null,
    totalDurationMs: null,
    ...overrides,
  } satisfies LibraryReleaseAsset;
}

describe('LibraryInspectorAssetSlots', () => {
  it('uses object UI for populated artwork and acquisition for empty kinds', () => {
    render(
      <LibraryInspectorAssetSlots
        asset={asset()}
        downloads={[]}
        defaultSectionOpen
      />
    );
    expect(screen.getByTestId('library-artwork-object')).toBeInTheDocument();
    expect(screen.queryByTestId('library-artwork-dropzone')).toBeNull();
    expect(screen.getByTestId('library-video-acquisition')).toBeInTheDocument();
  });

  it('shows an artwork drop zone only when empty', () => {
    render(
      <LibraryInspectorAssetSlots
        asset={asset({ artworkUrl: null, hasArtwork: false })}
        downloads={[]}
        defaultSectionOpen
      />
    );
    expect(screen.getByTestId('library-artwork-dropzone')).toBeInTheDocument();
  });

  it('keeps add secondary on populated stems and honors disabled', () => {
    render(
      <LibraryInspectorAssetSlots
        asset={asset()}
        downloads={[
          {
            id: 'stem-1',
            releaseId: 'release-1',
            title: 'Kick',
            fileName: 'kick.wav',
          },
        ]}
        disabled
        defaultSectionOpen
      />
    );
    expect(screen.getByTestId('library-stems-object')).toBeInTheDocument();
    expect(screen.queryByTestId('library-stems-dropzone')).toBeNull();
    expect(screen.getByTestId('library-stems-add')).toHaveAttribute(
      'href',
      '/app/releases/release-1/downloads'
    );
  });
});
