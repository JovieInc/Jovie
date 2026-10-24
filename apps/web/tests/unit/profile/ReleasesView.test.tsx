import { fireEvent, render, screen, within } from '@testing-library/react';
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
    // Artwork is decorative (empty alt) so the link name is the visible text.
    const newestArtwork = links[0]!.querySelector('img');
    const olderArtwork = links[1]!.querySelector('img');
    expect(newestArtwork).toHaveAttribute('alt', '');
    expect(newestArtwork).toHaveClass('object-contain');
    expect(newestArtwork).not.toHaveClass('object-cover');
    expect(newestArtwork).toHaveAttribute('data-priority', 'true');
    expect(within(links[0]!).queryByRole('button')).not.toBeInTheDocument();
    expect(olderArtwork).toHaveAttribute('data-priority', 'false');
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

    const link = screen.getByRole('link', { name: /Newest Song/ });
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

describe('ReleasesView text contrast contract (JOV-8873)', () => {
  it('raises release metadata to white/50', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const webRoot = process.cwd().endsWith('/apps/web')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const source = readFileSync(
      resolve(webRoot, 'components/features/profile/views/ReleasesView.tsx'),
      'utf8'
    );
    expect(source).toContain('tracking-tight text-white/50');
    expect(source).not.toContain('text-white/42');
  });
});
