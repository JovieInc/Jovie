import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAudioChromeSnapshot,
  resetAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import {
  APP_ROUTES,
  buildLyricsRoute,
  resolveLyricsReturnRoute,
} from '@/constants/routes';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
const seek = vi.fn();
const onError = vi.fn().mockReturnValue(() => {});
const push = vi.fn();
let pathname = '/app';
let searchParams = new URLSearchParams();

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
  hasLyrics: false,
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

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
  useRouter: () => ({ push }),
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
    push.mockClear();
    pathname = '/app';
    searchParams = new URLSearchParams();
    mockPlaybackState = { ...basePlaybackState };
    resetAudioChromeSnapshot();
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
    expect(screen.queryByRole('button', { name: 'Loop: off' })).toBeNull();
    expect(screen.getAllByText('Midnight Drive').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DJ Cool').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Hide waveform' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('audio-surface-expanded-shell')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(screen.getByTestId('audio-surface-compact-shell')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('wires shell V1 waveform seeking to the shared audio player', () => {
    setPlaying({
      artistName: 'DJ Cool',
      currentTime: 10,
      duration: 30,
    });

    render(<PersistentAudioBar variant='shellChatV1' />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const waveformSeek = within(expandedSurface).getByRole('slider', {
      name: 'Seek track waveform',
    });

    fireEvent.change(waveformSeek, { target: { value: '18' } });

    expect(seek).toHaveBeenCalledWith(18);
  });

  it('links the shell V1 lyrics button to the active track when DESIGN_V1 is enabled', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = '/app/chat/thread-1';
    searchParams = new URLSearchParams('panel=profile');

    render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Lyrics' }));

    expect(push).toHaveBeenCalledWith(
      buildLyricsRoute('track-1', {
        from: '/app/chat/thread-1?panel=profile',
      })
    );
  });

  it('closes the shell V1 lyrics button back to the last non-lyrics route', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.RELEASES;

    const { rerender } = render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      `from=${encodeURIComponent(APP_ROUTES.RELEASES)}`
    );
    rerender(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Close lyrics' }));

    expect(push).toHaveBeenCalledWith(APP_ROUTES.RELEASES);
  });

  it('prefers the explicit lyrics return route when closing from the shell V1 player', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    const { rerender } = render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      'from=%2Fapp%2Freleases%3Ftab%3Dscheduled'
    );
    rerender(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Close lyrics' }));

    expect(push).toHaveBeenCalledWith('/app/releases?tab=scheduled');
  });

  it('keeps the shell V1 lyrics button hidden when the active track has no lyrics', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: false });

    render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    expect(screen.queryByRole('button', { name: 'Lyrics' })).toBeNull();
  });

  it('keeps the shell V1 lyrics button hidden when DESIGN_V1 is disabled', () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(
      <AppFlagProvider
        initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: false }}
      >
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    expect(screen.queryByRole('button', { name: 'Lyrics' })).toBeNull();
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

  it('swaps shell audio surfaces when the player is minimized', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar variant='shellChatV1' />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const compactSurface = screen.getByTestId('audio-surface-compact-shell');

    expect(expandedSurface).toHaveAttribute('aria-hidden', 'false');
    expect(compactSurface).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Minimize player' }));

    expect(expandedSurface).toHaveAttribute('aria-hidden', 'true');
    expect(compactSurface).toHaveAttribute('aria-hidden', 'false');
  });

  it('publishes compact shell V1 chrome state while minimized and clears on unmount', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    const { unmount } = render(<PersistentAudioBar variant='shellChatV1' />);

    expect(getAudioChromeSnapshot()).toEqual({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });

    await user.click(screen.getByRole('button', { name: 'Minimize player' }));

    await waitFor(() => {
      expect(getAudioChromeSnapshot()).toEqual({
        activeTrackId: 'track-1',
        compactPlayerVisible: true,
        fullPlayerVisible: false,
      });
    });

    unmount();

    expect(getAudioChromeSnapshot()).toEqual({
      activeTrackId: null,
      compactPlayerVisible: false,
      fullPlayerVisible: false,
    });
  });

  it('handles shell V1 active-track keyboard shortcuts', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    fireEvent.keyDown(globalThis, { key: ' ' });
    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });

    fireEvent.keyDown(globalThis, { key: 'w' });
    expect(
      screen.getByRole('button', { name: 'Show waveform' })
    ).toBeInTheDocument();

    fireEvent.keyDown(globalThis, { key: 'l' });
    expect(push).toHaveBeenCalledWith(
      buildLyricsRoute('track-1', { from: APP_ROUTES.CHAT })
    );

    fireEvent.keyDown(globalThis, { key: '`' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('closes the lyrics route with Escape when an active track is present', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    const { rerender } = render(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      `from=${encodeURIComponent(APP_ROUTES.CHAT)}`
    );
    rerender(
      <AppFlagProvider initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1: true }}>
        <PersistentAudioBar variant='shellChatV1' />
      </AppFlagProvider>
    );

    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(push).toHaveBeenCalledWith(
      resolveLyricsReturnRoute(searchParams.get('from'), APP_ROUTES.CHAT)
    );
  });
});
