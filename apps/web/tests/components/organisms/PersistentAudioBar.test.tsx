import {
  act,
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
const playNext = vi.fn().mockResolvedValue(undefined);
const playPrevious = vi.fn().mockResolvedValue(undefined);
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
  queueLength: 0,
  queueIndex: -1,
  hasNext: false,
  hasPrevious: false,
};

type MockPlaybackState = typeof basePlaybackState;
let mockPlaybackState: MockPlaybackState = { ...basePlaybackState };

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mockPlaybackState,
    toggleTrack,
    playNext,
    playPrevious,
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

let mockPrefersReducedMotion = false;
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockPrefersReducedMotion,
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

function getExpandedShellMinimizeButton() {
  return within(screen.getByTestId('audio-surface-expanded-shell')).getByTestId(
    'audio-bar-minimize'
  );
}

describe('PersistentAudioBar', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    playNext.mockClear();
    playPrevious.mockClear();
    stop.mockClear();
    seek.mockClear();
    onError.mockClear().mockReturnValue(() => {});
    push.mockClear();
    pathname = '/app';
    searchParams = new URLSearchParams();
    mockPlaybackState = { ...basePlaybackState };
    mockPrefersReducedMotion = false;
    resetAudioChromeSnapshot();
  });

  /** Flush the two requestAnimationFrame ticks the cinematic reveal waits on. */
  async function flushReveal() {
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });
  }

  it('keeps a closed, zero-height idle playback slot when no track is active', () => {
    render(<PersistentAudioBar />);

    const idleSurfaces = [
      screen.getByTestId('audio-surface-idle-shell-desktop'),
      screen.getByTestId('audio-surface-idle-shell-mobile'),
    ];
    expect(idleSurfaces).toHaveLength(2);
    for (const surface of idleSurfaces) {
      expect(surface).toHaveAttribute('aria-hidden', 'true');
      expect(surface).toHaveAttribute('inert');
      expect(surface.style.maxHeight).toBe('0');
      expect(surface.style.pointerEvents).toBe('none');
    }
    expect(idleSurfaces[0]).toHaveClass('absolute');
  });

  it('opens and closes the idle playback tray with the global toggle shortcuts', () => {
    render(<PersistentAudioBar />);

    fireEvent.keyDown(globalThis, { key: '`' });

    const idleSurface = screen.getByTestId('audio-surface-idle-shell-desktop');
    expect(idleSurface).toHaveAttribute('aria-hidden', 'false');
    expect(idleSurface).not.toHaveAttribute('inert');
    expect(idleSurface).toHaveTextContent('Nothing playing');
    expect(idleSurface).toHaveTextContent(
      'Choose a track from Library to start playback.'
    );
    expect(
      screen.getAllByRole('button', { name: 'Open Library' })
    ).toHaveLength(2);

    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(idleSurface).toHaveAttribute('aria-hidden', 'true');

    fireEvent.keyDown(globalThis, { key: '\\', metaKey: true });
    expect(idleSurface).toHaveAttribute('aria-hidden', 'false');
  });

  it('does not toggle the idle tray while typing in a form control', () => {
    render(<PersistentAudioBar />);
    const input = document.createElement('input');
    document.body.append(input);

    fireEvent.keyDown(input, { key: '`' });

    expect(
      screen.getByTestId('audio-surface-idle-shell-desktop')
    ).toHaveAttribute('aria-hidden', 'true');
    input.remove();
  });

  it('does not toggle the idle tray from contenteditable text', () => {
    render(<PersistentAudioBar />);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.append(editor);

    fireEvent.keyDown(editor, { key: '\\', metaKey: true });

    expect(
      screen.getByTestId('audio-surface-idle-shell-desktop')
    ).toHaveAttribute('aria-hidden', 'true');
    editor.remove();
  });

  it('does not repeat the Library destination when the tray opens on Library', () => {
    pathname = APP_ROUTES.LIBRARY;
    render(<PersistentAudioBar />);

    fireEvent.keyDown(globalThis, { key: '`' });

    const idleSurface = screen.getByTestId('audio-surface-idle-shell-desktop');
    expect(idleSurface).toHaveTextContent('Choose a track to start playback.');
    expect(
      screen.queryByRole('button', { name: 'Open Library' })
    ).not.toBeInTheDocument();
  });

  it('snaps the idle tray without translation or transition under reduced motion', () => {
    mockPrefersReducedMotion = true;
    render(<PersistentAudioBar />);

    fireEvent.keyDown(globalThis, { key: '`' });

    const idleSurface = screen.getByTestId('audio-surface-idle-shell-desktop');
    expect(idleSurface.style.transform).toBe('translateY(0)');
    expect(idleSurface.style.transition).toBe('none');
  });

  it('renders bar with track info when a track is active', () => {
    setPlaying({
      currentTime: 14,
      releaseTitle: 'Night Vibes',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    });

    render(<PersistentAudioBar />);

    expect(screen.getAllByText('Midnight Drive').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DJ Cool · Night Vibes').length).toBeGreaterThan(
      0
    );
    expect(
      screen.getByRole('button', { name: 'Pause playback' })
    ).toBeInTheDocument();
    for (const artwork of screen.getAllByTestId('artwork-img')) {
      expect(artwork).toHaveAttribute('src', 'https://cdn.example.com/art.jpg');
    }
    expect(
      within(screen.getByTestId('audio-surface-expanded-shell')).getByRole(
        'button',
        { name: 'Dismiss Player' }
      )
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

    await user.click(
      within(screen.getByTestId('audio-surface-expanded-shell')).getByRole(
        'button',
        { name: 'Dismiss Player' }
      )
    );

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

    const mobileSurface = screen.getAllByRole('region', {
      name: 'Audio Player',
    })[1];
    const artwork = within(mobileSurface).getByTestId('artwork-img');

    fireEvent.error(artwork);

    expect(within(mobileSurface).queryByTestId('artwork-img')).toBeNull();
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
      screen.getAllByRole('region', { name: 'Audio Player' })
    ).toHaveLength(2);
  });

  it('renders the extracted canonical audio bar when requested', () => {
    setPlaying({
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
    });

    render(<PersistentAudioBar />);

    expect(getExpandedShellMinimizeButton()).toBeInTheDocument();
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

  it('wires the canonical expanded dismiss control to stop exactly once', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    await user.click(
      within(expandedSurface).getByRole('button', { name: 'Dismiss Player' })
    );

    expect(stop).toHaveBeenCalledOnce();
  });

  it('keeps the canonical expanded height stable from idle to playing', () => {
    setPlaying({ isPlaying: false, playbackStatus: 'idle' });
    const { rerender } = render(<PersistentAudioBar />);
    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const reservedHeight = 'var(--app-shell-audio-bar-max-height)';
    expect(expandedSurface.style.maxHeight).toBe(reservedHeight);

    setPlaying();
    rerender(<PersistentAudioBar />);

    expect(expandedSurface.style.maxHeight).toBe(reservedHeight);
  });

  it('wires canonical queue transport to the shared audio player', async () => {
    const user = userEvent.setup();
    setPlaying({
      artistName: 'DJ Cool',
      hasNext: true,
      hasPrevious: true,
      queueLength: 3,
      queueIndex: 1,
    });

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(playNext).toHaveBeenCalledTimes(1);
    expect(playPrevious).toHaveBeenCalledTimes(1);
  });

  it('hides canonical queue transport when the queue has no neighbors', () => {
    setPlaying({
      artistName: 'DJ Cool',
      hasNext: false,
      hasPrevious: false,
      queueLength: 1,
      queueIndex: 0,
    });

    render(<PersistentAudioBar />);

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
  });

  it('wires canonical waveform seeking to the shared audio player', () => {
    setPlaying({
      artistName: 'DJ Cool',
      currentTime: 10,
      duration: 30,
    });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const waveformSeek = within(expandedSurface).getByRole('slider', {
      name: 'Seek Track Waveform',
    });

    fireEvent.change(waveformSeek, { target: { value: '18' } });

    expect(seek).toHaveBeenCalledWith(18);
  });

  it('links the canonical lyrics button to the active track when the canonical shell is active', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = '/app/chat/thread-1';
    searchParams = new URLSearchParams('panel=profile');

    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Lyrics' }));

    expect(push).toHaveBeenCalledWith(
      buildLyricsRoute('track-1', {
        from: '/app/chat/thread-1?panel=profile',
      })
    );
  });

  it('closes the canonical lyrics button back to the last non-lyrics route', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.RELEASES;

    const { rerender } = render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      `from=${encodeURIComponent(APP_ROUTES.RELEASES)}`
    );
    rerender(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Close lyrics' }));

    expect(push).toHaveBeenCalledWith(APP_ROUTES.RELEASES);
  });

  it('prefers the explicit lyrics return route when closing from the canonical player', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    const { rerender } = render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      'from=%2Fapp%2Freleases%3Ftab%3Dscheduled'
    );
    rerender(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Close lyrics' }));

    expect(push).toHaveBeenCalledWith('/app/releases?tab=scheduled');
  });

  it('keeps the canonical lyrics button hidden when the active track has no lyrics', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: false });

    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    expect(screen.queryByRole('button', { name: 'Lyrics' })).toBeNull();
  });

  it('hides the full docked player after minimizing (mini lives in the sidebar)', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    await user.click(getExpandedShellMinimizeButton());

    expect(screen.getByTestId('audio-surface-expanded-shell')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    // Compact bottom shell is intentionally empty — sidebar bridge owns mini.
    expect(screen.getByTestId('audio-surface-compact-shell')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(
      within(screen.getByTestId('audio-surface-compact-shell')).queryByRole(
        'button',
        { name: 'Pause' }
      )
    ).toBeNull();
  });

  it('swaps shell audio surfaces when the player is minimized', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const compactSurface = screen.getByTestId('audio-surface-compact-shell');

    expect(expandedSurface).toHaveAttribute('aria-hidden', 'false');
    expect(compactSurface).toHaveAttribute('aria-hidden', 'true');

    await user.click(getExpandedShellMinimizeButton());

    expect(expandedSurface).toHaveAttribute('aria-hidden', 'true');
    expect(compactSurface).toHaveAttribute('aria-hidden', 'false');
  });

  it('docks the expanded shell without elevated card shadow chrome', () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    expect(expandedSurface.className).toContain('border-t');
    expect(expandedSurface.className).not.toMatch(/shadow-\[/);
  });

  it('publishes compact canonical chrome state while minimized and clears on unmount', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    const { unmount } = render(<PersistentAudioBar />);

    expect(getAudioChromeSnapshot()).toEqual({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });

    await user.click(getExpandedShellMinimizeButton());

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

  it('handles canonical active-track keyboard shortcuts', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
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
    // Minimize collapses the full docked bar; mini chrome lives in the sidebar.
    expect(screen.getByTestId('audio-surface-expanded-shell')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('closes the lyrics route with Escape when an active track is present', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });
    pathname = APP_ROUTES.CHAT;

    const { rerender } = render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    pathname = buildLyricsRoute('track-1');
    searchParams = new URLSearchParams(
      `from=${encodeURIComponent(APP_ROUTES.CHAT)}`
    );
    rerender(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    fireEvent.keyDown(globalThis, { key: 'Escape' });

    expect(push).toHaveBeenCalledWith(
      resolveLyricsReturnRoute(searchParams.get('from'), APP_ROUTES.CHAT)
    );
  });

  it('cinematically reveals the canonical bar into place on first play', async () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');

    // First frame: off the bottom + transparent so the transition has a
    // "from" state to decelerate out of.
    expect(expandedSurface.style.transform).toBe('translateY(100%)');
    expect(expandedSurface.style.opacity).toBe('0');

    await flushReveal();

    // Lands into place: no translate offset, fully opaque, interactive.
    expect(expandedSurface.style.transform).toBe('translateY(0)');
    expect(expandedSurface.style.opacity).toBe('1');
    expect(expandedSurface.style.pointerEvents).toBe('auto');
  });

  it('keeps the reserved bar height across the reveal so nothing shifts', async () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    const reservedHeight = 'var(--app-shell-audio-bar-max-height)';

    // Height is reserved from the very first frame (only transform/opacity
    // animate), so surrounding content never reflows.
    expect(expandedSurface.style.maxHeight).toBe(reservedHeight);

    await flushReveal();

    expect(expandedSurface.style.maxHeight).toBe(reservedHeight);
  });

  it('snaps the canonical bar revealed without a translate frame under reduced motion', () => {
    mockPrefersReducedMotion = true;
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');

    // No translateY(100%) frame ever paints — it's already in place.
    expect(expandedSurface.style.transform).toBe('translateY(0)');
    expect(expandedSurface.style.opacity).toBe('1');
  });
});
