import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
const seek = vi.fn();
const onError = vi.fn().mockReturnValue(() => {});

let mockPlaybackState = {
  activeTrackId: null as string | null,
  isPlaying: false,
  playbackStatus: 'idle' as string,
  lastErrorReason: null as
    | 'play_rejected'
    | 'media_error'
    | 'missing_source'
    | null,
  currentTime: 0,
  duration: 0,
  trackTitle: null as string | null,
  releaseTitle: null as string | null,
  artistName: null as string | null,
  artworkUrl: null as string | null,
};

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mockPlaybackState,
    toggleTrack,
    seek,
    stop,
    onError,
  }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/components/atoms/SeekBar', () => ({
  SeekBar: (props: { disabled?: boolean }) => (
    <input type='range' data-testid='seek-bar' disabled={props.disabled} />
  ),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
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

const { PersistentAudioBar } = await import(
  '@/components/organisms/PersistentAudioBar'
);

describe('PersistentAudioBar', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    stop.mockClear();
    seek.mockClear();
    onError.mockClear().mockReturnValue(() => {});
    mockPlaybackState = {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      lastErrorReason: null,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };
  });

  it('renders nothing when no track is active', () => {
    const { container } = render(<PersistentAudioBar />);
    expect(container.innerHTML).toBe('');
  });

  it('renders bar with track info when a track is active', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 14,
      duration: 30,
      trackTitle: 'Midnight Drive',
      releaseTitle: 'Night Vibes',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    };

    render(<PersistentAudioBar />);

    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.getByText('DJ Cool · Night Vibes')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pause playback' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('artwork-img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/art.jpg'
    );
    expect(
      screen.getByRole('button', { name: 'Dismiss player' })
    ).toBeInTheDocument();
  });

  it('shows play button when paused', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 30,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('button', { name: 'Resume playback' })
    ).toBeInTheDocument();
  });

  it('calls toggleTrack when play/pause is clicked', async () => {
    const user = userEvent.setup();
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 10,
      duration: 30,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Pause playback' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });
  });

  it('calls stop when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 10,
      duration: 30,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Dismiss player' }));

    expect(stop).toHaveBeenCalled();
  });

  it('shows loading state with disabled seek bar', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      playbackStatus: 'loading',
      currentTime: 0,
      duration: 0,
      trackTitle: 'Midnight Drive',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('button', { name: 'Loading track' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('seek-bar')).toBeDisabled();
  });

  it('falls back to placeholder when artwork image errors', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
      releaseTitle: null,
      artistName: null,
      artworkUrl: 'https://cdn.example.com/broken.jpg',
    };

    render(<PersistentAudioBar />);

    const img = screen.getByTestId('artwork-img');
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });

  it('renders placeholder when artworkUrl is null', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });

  it('shows Preview badge for short tracks', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 10,
      duration: 30,
      trackTitle: 'Short Preview',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('uses section element with aria-label', () => {
    mockPlaybackState = {
      activeTrackId: 'track-1',
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 30,
      trackTitle: 'Test',
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    };

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('region', { name: 'Audio player' })
    ).toBeInTheDocument();
  });
});
