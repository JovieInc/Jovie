import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildLibraryReleaseAssets } from '@/app/app/(shell)/library/library-data';
import {
  LibraryCatalogArtworkCell,
  LibraryCatalogWaveformCell,
} from '@/components/features/library/library-catalog-columns';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & { readonly unoptimized?: boolean }
  ) => {
    const { unoptimized: _unoptimized, ...imgProps } = props;
    return <img alt='' {...imgProps} />;
  },
}));

function buildRelease(
  previewVerification: ReleaseViewModel['previewVerification']
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
    previewUrl: 'https://example.com/preview.mp3',
    previewVerification,
  };
}

describe('LibraryCatalogWaveformCell', () => {
  it('keeps table artwork in the single caller-owned row frame', () => {
    const [asset] = buildLibraryReleaseAssets([buildRelease('verified')]);

    render(<LibraryCatalogArtworkCell asset={asset!} />);

    const thumbnail = screen.getByTestId('library-media-thumbnail-release-1');
    expect(thumbnail).toHaveAttribute('data-artwork-frame', 'thumbnail');
    expect(thumbnail).toHaveClass('h-9', 'w-9');
    expect(thumbnail.querySelector('img')).toHaveClass(
      'h-full',
      'w-full',
      'object-contain'
    );
  });

  it('renders the waveform only for a verified preview', () => {
    const [asset] = buildLibraryReleaseAssets([buildRelease('verified')]);

    render(<LibraryCatalogWaveformCell asset={asset!} />);

    const cell = screen.getByTestId('library-catalog-waveform-release-1');
    expect(cell).toHaveAttribute('data-audio-state', 'verified');
    expect(cell.querySelector('svg')).toBeInTheDocument();
  });

  it('keeps unavailable preview slots honest and layout-stable', () => {
    const [asset] = buildLibraryReleaseAssets([buildRelease('fallback')]);

    render(<LibraryCatalogWaveformCell asset={asset!} />);

    const cell = screen.getByTestId('library-catalog-waveform-release-1');
    expect(cell).toHaveAttribute('data-audio-state', 'unavailable');
    expect(cell).toHaveAttribute('aria-label', 'Audio preview unavailable');
    expect(cell).toHaveAttribute('title', 'Audio preview unavailable');
    expect(cell.querySelector('svg')).not.toBeInTheDocument();
    expect(cell).toHaveTextContent('—');
    expect(cell).toHaveClass('h-6', 'w-40');
  });
});
