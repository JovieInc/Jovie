import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const onError = vi.fn().mockReturnValue(() => {});

let mockPlaybackState = {
  activeTrackId: null as string | null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  trackTitle: null as string | null,
  releaseTitle: null as string | null,
  artistName: null as string | null,
  artworkUrl: null as string | null,
};

let mockSidebarState: 'open' | 'closed' = 'open';

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mockPlaybackState,
    toggleTrack,
    onError,
  }),
}));

vi.mock('@/components/organisms/sidebar/context', () => ({
  useSidebar: () => ({
    state: mockSidebarState,
  }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, onError: onImgError, ...rest } = props;
    return (
      <img
        src={src as string}
        alt={alt as string}
        data-testid='artwork-img'
        onError={onImgError as () => void}
        {...rest}
      />
    );
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const { NowPlayingCard } = await import(
  '@/components/organisms/sidebar/NowPlayingCard'
);

describe('NowPlayingCard', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    onError.mockClear().mockReturnValue(() => {});
    mockSidebarState = 'open';
    mockPlaybackState = {
      activeTrackId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };
  });

  it('renders nothing when no track is active', () => {
    const { container } = render(<NowPlayingCard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders expanded view with track info when sidebar is open', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      currentTime: 45,
      duration: 180,
      trackTitle: 'Midnight Drive',
      releaseTitle: 'Night Vibes',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    };

    render(<NowPlayingCard />);

    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    // Artist and release joined with separator
    expect(screen.getByText('DJ Cool \u00B7 Night Vibes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pause playback' })
    ).toBeInTheDocument();
    // Artwork image rendered
    expect(screen.getByTestId('artwork-img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/art.jpg'
    );
  });

  it('shows play button when paused in expanded view', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      currentTime: 0,
      duration: 180,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<NowPlayingCard />);

    expect(
      screen.getByRole('button', { name: 'Resume playback' })
    ).toBeInTheDocument();
  });

  it('calls toggleTrack when play/pause button is clicked', async () => {
    const user = userEvent.setup();
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      currentTime: 10,
      duration: 180,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<NowPlayingCard />);

    await user.click(screen.getByRole('button', { name: 'Pause playback' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
      audioUrl: '_resume',
    });
  });

  it('renders collapsed view with only icon button when sidebar is closed', () => {
    mockSidebarState = 'closed';
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<NowPlayingCard />);

    // Should have a button but no track title text
    expect(
      screen.getByRole('button', { name: 'Pause playback' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Midnight Drive')).not.toBeInTheDocument();
  });

  it('falls back to Play icon placeholder when artwork image errors', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
      releaseTitle: null,
      artistName: null,
      artworkUrl: 'https://cdn.example.com/broken.jpg',
    };

    render(<NowPlayingCard />);

    // Initially the image is rendered
    const img = screen.getByTestId('artwork-img');
    expect(img).toBeInTheDocument();

    // Fire error on the image
    fireEvent.error(img);

    // After error, image should be gone and replaced by placeholder
    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });

  it('renders placeholder when artworkUrl is null', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<NowPlayingCard />);

    // No image should be rendered
    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });
});
