import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
const seek = vi.fn();
const onError = vi.fn().mockReturnValue(() => {});

const basePlaybackState = {
  activeTrackId: null as string | null,
  isPlaying: false,
  playbackStatus: 'idle' as 'idle' | 'loading' | 'playing' | 'paused' | 'error',
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

type MockPlaybackState = typeof basePlaybackState;
let mockPlaybackState: MockPlaybackState = { ...basePlaybackState };

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
    delete rest.fill;
    delete rest.unoptimized;
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

/** Helper to set active playback state with sensible defaults */
function setPlaying(overrides: Partial<MockPlaybackState> = {}) {
  mockPlaybackState = {
    ...basePlaybackState,
    activeTrackId: 'track-1',
    isPlaying: true,
    playbackStatus: 'playing',
    currentTime: 10,
    duration: 30,
    trackTitle: 'Midnight Drive',
    ...overrides,
  };
}

describe('PersistentAudioBar', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    stop.mockClear();
    seek.mockClear();
    onError.mockClear().mockReturnValue(() => {});
    mockPlaybackState = { ...basePlaybackState };
  });

  it('renders nothing when no track is active', () => {
    const { container } = render(<PersistentAudioBar />);
    expect(container.innerHTML).toBe('');
  });

  it('renders bar with track info when a track is active', () => {
    setPlaying({
      currentTime: 14,
      releaseTitle: 'Night Vibes',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    });

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
    setPlaying({ isPlaying: false, playbackStatus: 'paused', currentTime: 0 });

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('button', { name: 'Resume playback' })
    ).toBeInTheDocument();
  });

  it('calls toggleTrack when play/pause is clicked', async () => {
    const user = userEvent.setup();
    setPlaying();

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Pause playback' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });
  });

  it('calls stop when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    setPlaying();

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Dismiss player' }));

    expect(stop).toHaveBeenCalled();
  });

  it('shows loading state with disabled seek bar', () => {
    setPlaying({
      isPlaying: false,
      playbackStatus: 'loading',
      currentTime: 0,
      duration: 0,
    });

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('button', { name: 'Loading track' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('seek-bar')).toBeDisabled();
  });

  it('falls back to placeholder when artwork image errors', () => {
    setPlaying({
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
      artworkUrl: 'https://cdn.example.com/broken.jpg',
    });

    render(<PersistentAudioBar />);

    const img = screen.getByTestId('artwork-img');
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });

  it('renders placeholder when artworkUrl is null', () => {
    setPlaying({
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      duration: 0,
      trackTitle: 'Test Track',
    });

    render(<PersistentAudioBar />);

    expect(screen.queryByTestId('artwork-img')).not.toBeInTheDocument();
  });

  it('shows Preview badge for short tracks', () => {
    setPlaying({ trackTitle: 'Short Preview' });

    render(<PersistentAudioBar />);

    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('uses section element with aria-label', () => {
    setPlaying({
      isPlaying: false,
      playbackStatus: 'paused',
      currentTime: 0,
      trackTitle: 'Test',
    });

    render(<PersistentAudioBar />);

    expect(
      screen.getByRole('region', { name: 'Audio player' })
    ).toBeInTheDocument();
  });

  it('renders the extracted shell V1 audio bar when requested', () => {
    setPlaying({
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    });

    render(<PersistentAudioBar variant='shellChatV1' />);

    expect(
      screen.getByRole('button', { name: 'Minimize player' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Loop: off' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Midnight Drive').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DJ Cool').length).toBeGreaterThan(0);
  });

  it('shows the compact shell V1 now-playing row after minimizing', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar variant='shellChatV1' />);

    await user.click(screen.getByRole('button', { name: 'Minimize player' }));

    await user.click(screen.getByRole('button', { name: 'Pause' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });
  });
});
