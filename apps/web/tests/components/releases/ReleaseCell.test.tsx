import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState = { activeTrackId: null as string | null, isPlaying: false };

beforeEach(() => {
  toggleTrack.mockClear();
  playbackState = { activeTrackId: null, isPlaying: false };
});

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
    seek: vi.fn(),
  }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

const { ReleaseCell } = await import(
  '@/features/dashboard/organisms/releases/cells/ReleaseCell'
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
  it('renders release title, type badge, and artist line', () => {
    render(<ReleaseCell release={baseRelease} artistName='Jovie Artist' />);

    expect(screen.getByText('Skyline Dreams')).toBeInTheDocument();
    // Without a previewUrl the type renders as a colored dot with title, not text
    const typeDot = screen.getByTitle('Single');
    expect(typeDot).toBeInTheDocument();
    expect(typeDot.className).toContain('shrink-0');
    expect(screen.getByText('Jovie Artist')).toBeInTheDocument();
  });

  it('toggles preview playback when a preview url is available', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReleaseCell release={baseRelease} artistName='Jovie Artist' />
    );

    expect(
      screen.queryByRole('button', { name: 'Play Skyline Dreams' })
    ).not.toBeInTheDocument();

    const releaseWithPreview = {
      ...baseRelease,
      previewUrl: 'https://cdn.example.com/preview.mp3',
    };

    rerender(
      <ReleaseCell release={releaseWithPreview} artistName='Jovie Artist' />
    );

    await user.click(
      screen.getByRole('button', { name: 'Play Skyline Dreams' })
    );

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'release-1',
      title: 'Skyline Dreams',
      audioUrl: 'https://cdn.example.com/preview.mp3',
      releaseTitle: 'Skyline Dreams',
      artistName: undefined,
      artworkUrl: undefined,
      hasLyrics: false,
    });
  });

  it('opens the release drawer when a primary select handler is provided', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ReleaseCell
        release={baseRelease}
        artistName='Jovie Artist'
        onSelect={onSelect}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open Skyline Dreams' })
    );

    expect(onSelect).toHaveBeenCalledWith(baseRelease);
  });

  it('keeps the active preview control visible while playing', () => {
    playbackState = { activeTrackId: 'release-1', isPlaying: true };

    render(
      <ReleaseCell
        release={{
          ...baseRelease,
          previewUrl: 'https://cdn.example.com/preview.mp3',
        }}
        artistName='Jovie Artist'
      />
    );

    const pauseButton = screen.getByRole('button', {
      name: 'Pause Skyline Dreams',
    });

    expect(pauseButton).toHaveAttribute('aria-pressed', 'true');
    expect(pauseButton.className).toContain('opacity-100');
  });
});
