import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryShareAssetLayouts } from '@/components/features/library-share/LibraryShareAssetLayouts';
import type { LibraryShareDropAsset } from '@/lib/library-share/types';

const asset: LibraryShareDropAsset = {
  id: 'item-1',
  releaseId: 'release-1',
  title: 'Midnight Drive',
  artistName: 'Tim White',
  artworkUrl: 'https://example.com/art.jpg',
  previewUrl: 'https://example.com/preview.mp3',
  lyrics: null,
  releaseType: 'single',
  releaseDate: '2026-01-15T00:00:00.000Z',
  smartLinkPath: '/timwhite/midnight-drive',
  includeArtwork: true,
  includePreview: true,
  includeLyrics: false,
};

describe('LibraryShareAssetLayouts', () => {
  it('renders the grid layout by default', () => {
    render(
      <LibraryShareAssetLayouts
        assets={[asset]}
        layout='grid'
        downloadsEnabled
      />
    );

    expect(screen.getByTestId('library-share-layout-grid')).toBeInTheDocument();
    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.getByText('Download preview')).toBeInTheDocument();
  });

  it('renders the list layout', () => {
    render(
      <LibraryShareAssetLayouts
        assets={[asset]}
        layout='list'
        downloadsEnabled={false}
      />
    );

    expect(screen.getByTestId('library-share-layout-list')).toBeInTheDocument();
    expect(screen.queryByText('Download preview')).not.toBeInTheDocument();
  });

  it('renders the reel layout', () => {
    render(
      <LibraryShareAssetLayouts
        assets={[asset]}
        layout='reel'
        downloadsEnabled
      />
    );

    expect(screen.getByTestId('library-share-layout-reel')).toBeInTheDocument();
  });
});
