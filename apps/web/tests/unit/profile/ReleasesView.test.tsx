import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesView } from '@/components/features/profile/views/ReleasesView';
import type { PublicRelease } from '@/features/profile/releases/types';

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
    className,
    priority,
    loading,
  }: {
    readonly alt: string;
    readonly src?: string | null;
    readonly className?: string;
    readonly priority?: boolean;
    readonly loading?: 'eager' | 'lazy';
  }) => (
    <img
      alt={alt}
      src={src ?? undefined}
      className={className}
      data-priority={priority ? 'true' : 'false'}
      data-loading={loading}
    />
  ),
}));

const releases: PublicRelease[] = [
  {
    id: 'older-release',
    title: 'Older Song',
    slug: 'older-song',
    releaseType: 'single',
    releaseDate: '2024-01-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/older-song.jpg',
    artistNames: ['Tim White'],
  },
  {
    id: 'newest-release',
    title: 'Newest Song',
    slug: 'newest-song',
    releaseType: 'album',
    releaseDate: '2026-01-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/newest-song.jpg',
    artistNames: ['Tim White'],
  },
];

describe('ReleasesView', () => {
  it('renders a chronological Music list with the latest item first', () => {
    render(
      <ReleasesView
        releases={releases}
        artistId='artist-1'
        artistHandle='tim'
        artistName='Tim White'
      />
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/tim/newest-song');
    expect(links[1]).toHaveAttribute('href', '/tim/older-song');
    expect(screen.getByText('Latest')).toBeVisible();
    expect(screen.queryByText('Latest Release')).not.toBeInTheDocument();
    expect(screen.queryByText('More Releases')).not.toBeInTheDocument();
    expect(screen.getByAltText('Newest Song')).toHaveClass('object-contain');
    expect(screen.getByAltText('Newest Song')).not.toHaveClass('object-cover');
    expect(screen.getByAltText('Newest Song')).toHaveAttribute(
      'data-priority',
      'true'
    );
    expect(screen.getByAltText('Older Song')).toHaveAttribute(
      'data-priority',
      'false'
    );
  });

  it('tracks release clicks with profile context', () => {
    render(
      <ReleasesView
        releases={releases}
        artistId='artist-1'
        artistHandle='tim'
        artistName='Tim White'
      />
    );

    const link = screen.getByRole('link', { name: 'View Newest Song' });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);

    expect(trackMock).toHaveBeenCalledWith(
      'release_click',
      expect.objectContaining({
        artist_id: 'artist-1',
        profile_id: 'artist-1',
        profile_slug: 'tim',
        release_id: 'newest-release',
        current_route_tab: 'music',
        is_latest: true,
      })
    );
  });
});
