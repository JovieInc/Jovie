import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LibraryMediaThumbnail } from '@/app/app/(shell)/library/LibraryMediaThumbnail';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';

vi.mock('next/image', () => ({
  default: (
    props: ComponentProps<'img'> & { readonly unoptimized?: boolean }
  ) => {
    const { unoptimized: _unoptimized, ...imgProps } = props;
    return <img alt='' {...imgProps} />;
  },
}));

function buildAsset(
  overrides: Partial<LibraryReleaseAsset> = {}
): LibraryReleaseAsset {
  return {
    id: 'release-1',
    title: 'Take Me Over',
    artist: 'Tim White',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    previewUrl: 'https://cdn.example.com/preview.mp3',
    videoUrl: null,
    waveformSeed: 17,
    smartLinkPath: '/tim/take-me-over',
    releaseDate: '2026-04-28T00:00:00.000Z',
    releaseType: 'single',
    status: 'released',
    trackCount: 1,
    providerCount: 1,
    providers: [],
    hasLyrics: true,
    hasArtwork: true,
    hasVideoLinks: false,
    assetKinds: ['artwork', 'preview'],
    genres: [],
    spotifyPopularity: 68,
    targetPlaylistCount: 0,
    isExplicit: false,
    label: null,
    upc: null,
    distributor: null,
    totalDurationMs: 212_000,
    ...overrides,
  };
}

describe('LibraryMediaThumbnail', () => {
  it('renders static artwork when no scrub media is available', () => {
    render(
      <LibraryMediaThumbnail
        asset={buildAsset({ previewUrl: null, videoUrl: null })}
        size='row'
      />
    );

    expect(
      screen.getByTestId('library-media-thumbnail-release-1')
    ).toHaveAttribute('data-preview-mode', 'static');
    expect(
      screen.queryByTestId('library-audio-waveform-thumbnail')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('library-video-scrub-thumbnail')
    ).not.toBeInTheDocument();
  });

  it('reveals an audio waveform scrub overlay on hover', () => {
    render(<LibraryMediaThumbnail asset={buildAsset()} size='card' />);

    const thumbnail = screen.getByTestId('library-media-thumbnail-release-1');
    const scrubSurface = screen.getByTestId(
      'library-media-scrub-surface-release-1'
    );
    expect(thumbnail).toHaveAttribute('data-preview-mode', 'audio');

    vi.spyOn(scrubSurface, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(scrubSurface, { clientX: 100 });
    fireEvent.mouseMove(scrubSurface, { clientX: 100 });

    const overlay = screen.getByTestId('library-audio-waveform-thumbnail');
    expect(overlay).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('1:46')).toBeInTheDocument();
  });

  it('prefers video scrub previews when a canvas video URL exists', () => {
    render(
      <LibraryMediaThumbnail
        asset={buildAsset({
          videoUrl: 'https://cdn.example.com/canvas.mp4',
        })}
        size='card'
      />
    );

    const thumbnail = screen.getByTestId('library-media-thumbnail-release-1');
    const scrubSurface = screen.getByTestId(
      'library-media-scrub-surface-release-1'
    );
    expect(thumbnail).toHaveAttribute('data-preview-mode', 'video');

    fireEvent.mouseEnter(scrubSurface, { clientX: 40 });
    fireEvent.mouseMove(scrubSurface, { clientX: 80 });

    expect(screen.getByTestId('library-video-scrub-thumbnail')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(
      screen.queryByTestId('library-audio-waveform-thumbnail')
    ).not.toBeInTheDocument();
  });
});
