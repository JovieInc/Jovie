import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: { activeTrackId: null, isPlaying: false },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({ platform }: { platform: string }) => (
    <span data-testid='provider-icon'>{platform}</span>
  ),
}));

const { ReleaseCell } = await import(
  '@/components/dashboard/organisms/releases/cells/ReleaseCell'
);

const baseRelease: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Spotify',
      path: '/s/1',
      isPrimary: true,
    },
    {
      key: 'apple_music',
      url: 'https://music.apple.com/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'Apple Music',
      path: '/a/1',
      isPrimary: false,
    },
    {
      key: 'youtube',
      url: 'https://music.youtube.com/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'YouTube Music',
      path: '/y/1',
      isPrimary: false,
    },
    {
      key: 'soundcloud',
      url: 'https://soundcloud.com/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00.000Z',
      label: 'SoundCloud',
      path: '/c/1',
      isPrimary: false,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

describe('ReleaseCell', () => {
  it('right-aligns and tightly clusters provider icons', () => {
    const { container } = render(
      <ReleaseCell release={baseRelease} artistName='Jovie Artist' />
    );

    const iconCluster =
      screen.getAllByTestId('provider-icon')[0]?.parentElement;
    expect(iconCluster).toHaveClass('-space-x-0.5');

    const rightAlignedContainers = container.querySelectorAll('.justify-end');
    expect(rightAlignedContainers.length).toBeGreaterThan(0);
  });

  it('shows only three provider icons with overflow count', () => {
    render(<ReleaseCell release={baseRelease} artistName='Jovie Artist' />);

    const icons = screen.getAllByTestId('provider-icon');
    expect(icons).toHaveLength(3);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(icons.map(icon => icon.textContent)).toEqual([
      'spotify',
      'apple_music',
      'youtube',
    ]);
  });
});
