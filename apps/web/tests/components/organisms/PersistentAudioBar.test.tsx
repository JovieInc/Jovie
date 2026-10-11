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
  type MediaCanvasTransportSnapshot,
  publishMediaCanvasTransport,
  registerMediaCanvasTransport,
  resetAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';
import {
  APP_ROUTES,
  buildLyricsRoute,
  resolveLyricsReturnRoute,
} from '@/constants/routes';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { detectReversibleControl } from '@/tests/utils/reversible-control-detector';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const playNext = vi.fn().mockResolvedValue(undefined);
const playPrevious = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
const seek = vi.fn();
const onError = vi.fn().mockReturnValue(() => {});
const push = vi.fn();
const prefetch = vi.fn();
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
  bpm: null as number | null,
  musicalKey: null as string | null,
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
  useRouter: () => ({ push, prefetch }),
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
  SeekBar: (props: { disabled?: boolean; onSeek?: (time: number) => void }) => (
    <input
      type='range'
      data-testid='seek-bar'
      disabled={props.disabled}
      onChange={event =>
        props.onSeek?.(Number((event.target as HTMLInputElement).value))
      }
    />
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

function getExpandedShell() {
  return screen.getByTestId('audio-surface-expanded-shell');
}

function getDock() {
  return screen.getByTestId('shell-audio-dock');
}

function getDockContent() {
  return screen.getByTestId('shell-audio-dock-content');
}

function getPlayerVisibilityToggle() {
  return screen.getByTestId('player-visibility-toggle');
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
    prefetch.mockClear();
    pathname = '/app';
    searchParams = new URLSearchParams();
    mockPlaybackState = { ...basePlaybackState };
    mockPrefersReducedMotion = false;
    resetAudioChromeSnapshot();
    globalThis.localStorage?.clear();
  });

  /** Flush the two requestAnimationFrame ticks the cinematic reveal waits on. */
  async function flushReveal() {
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    });
  }

  it('keeps the dock collapsed (zero reserved space) when no track is active', () => {
    render(<PersistentAudioBar />);

    // The dock stays mounted so a stop/dismiss can animate the panel back
    // down — idle means data-state=closed, max-height 0, no player chrome.
    const dock = getDock();
    expect(dock).toHaveAttribute('data-state', 'closed');
    expect(dock).toHaveAttribute('aria-hidden', 'true');
    expect(dock.style.maxHeight).toBe('0px');
    expect(screen.queryByRole('region', { name: 'Audio Player' })).toBeNull();
    expect(screen.queryByTestId('player-visibility-toggle')).toBeNull();
  });

  it('keeps compact playback artwork contained instead of cropping it', async () => {
    setPlaying({ artworkUrl: 'https://x.invalid/art.jpg' });
    render(<PersistentAudioBar />);
    await flushReveal();

    const artwork = screen.getAllByTestId('artwork-img')[0];
    expect(artwork).toHaveClass('object-contain');
    expect(artwork).not.toHaveClass('object-cover');
  });

  it('does not toggle the player from a form control keydown', () => {
    setPlaying();
    render(<PersistentAudioBar />);
    const input = document.createElement('input');
    document.body.append(input);

    fireEvent.keyDown(input, { key: '`' });

    expect(getExpandedShell()).toHaveAttribute('aria-hidden', 'false');
    input.remove();
  });

  it('does not toggle the player from contenteditable text', () => {
    setPlaying();
    render(<PersistentAudioBar />);
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    document.body.append(editor);

    fireEvent.keyDown(editor, { key: '\\', metaKey: true });

    expect(getExpandedShell()).toHaveAttribute('aria-hidden', 'false');
    editor.remove();
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
  });

  it('converges rendered metadata when the playing release is mutated', () => {
    setPlaying({
      releaseTitle: 'Old Title',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/old.jpg',
    });
    const { rerender } = render(<PersistentAudioBar />);

    setPlaying({
      releaseTitle: 'New Title',
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/new.jpg',
      trackTitle: 'Renamed Track',
    });
    rerender(<PersistentAudioBar />);

    expect(screen.queryByText('Old Title')).toBeNull();
    expect(screen.getAllByText('Renamed Track').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DJ Cool · New Title').length).toBeGreaterThan(
      0
    );
    for (const artwork of screen.getAllByTestId('artwork-img')) {
      expect(artwork).toHaveAttribute('src', 'https://cdn.example.com/new.jpg');
    }
  });

  it('never renders a collapse/minimize control', () => {
    setPlaying({ artistName: 'DJ Cool' });
    render(<PersistentAudioBar />);

    expect(screen.queryByTestId('audio-bar-minimize')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /minimize/i })
    ).not.toBeInTheDocument();
  });

  it('renders a dismiss control that hides the dock and stops playback', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });
    render(<PersistentAudioBar />);

    const dismiss = screen.getByRole('button', { name: 'Dismiss Player' });
    await user.click(dismiss);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('renders exactly one subtle visibility toggle that opens/closes the player', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });
    render(<PersistentAudioBar />);

    const toggle = getPlayerVisibilityToggle();
    expect(toggle).toHaveAttribute('aria-label', 'Hide Player');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(getPlayerVisibilityToggle()).toHaveAttribute(
      'aria-label',
      'Show Player'
    );
    expect(getExpandedShell()).toHaveAttribute('aria-hidden', 'true');
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
    const mobileSurface = screen.getAllByRole('region', {
      name: 'Audio Player',
    })[1];
    expect(mobileSurface).toHaveAttribute('data-mobile-audio-surface', 'true');
    expect(mobileSurface).not.toHaveClass(
      'max-lg:mb-[calc(3.5rem+env(safe-area-inset-bottom))]'
    );
  });

  it('is compact by default: no waveform, no BPM · key facts', () => {
    setPlaying({
      artistName: 'DJ Cool',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      bpm: 118,
      musicalKey: '8A',
    });

    render(<PersistentAudioBar />);

    expect(screen.getAllByText('Midnight Drive').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: 'Show waveform' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', { name: 'Seek Track Waveform' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('118 BPM · 8A')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-surface-expanded-shell')).toHaveAttribute(
      'aria-hidden',
      'false'
    );
    expect(screen.getByTestId('shell-audio-dock')).toHaveAttribute(
      'data-state',
      'open'
    );
  });

  it('keeps track identity out of the desktop controls and timeline dock', () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const desktopDock = screen.getByTestId('audio-surface-expanded-shell');
    expect(within(desktopDock).queryByText('Midnight Drive')).toBeNull();
    expect(within(desktopDock).queryByText('DJ Cool')).toBeNull();
    expect(
      within(desktopDock).getByRole('button', { name: 'Pause (space)' })
    ).toBeInTheDocument();
    expect(
      within(desktopDock).getByRole('button', { name: 'Show waveform' })
    ).toBeInTheDocument();
  });

  it('expands to show the waveform and BPM · key facts only when known', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool', bpm: 118, musicalKey: '8A' });

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Show waveform' }));

    expect(
      screen.getByRole('button', { name: 'Hide waveform' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'Seek Track Waveform' })
    ).toBeInTheDocument();
    expect(screen.getByText('118 BPM · 8A')).toBeInTheDocument();
  });

  it('never fabricates BPM · key facts — hides the row when unknown', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    await user.click(screen.getByRole('button', { name: 'Show waveform' }));

    expect(screen.queryByText(/BPM/)).not.toBeInTheDocument();
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

  it('wires canonical waveform seeking to the shared audio player', async () => {
    const user = userEvent.setup();
    setPlaying({
      artistName: 'DJ Cool',
      currentTime: 10,
      duration: 30,
    });

    render(<PersistentAudioBar />);
    await user.click(screen.getByRole('button', { name: 'Show waveform' }));

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

  it('prefetches the lyrics route on pointer and keyboard intent', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: true });

    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    const lyricsButton = screen.getByRole('button', { name: 'Lyrics' });
    fireEvent.pointerEnter(lyricsButton);
    expect(prefetch).toHaveBeenCalledWith(buildLyricsRoute('track-1'));

    prefetch.mockClear();
    fireEvent.focus(lyricsButton);
    expect(prefetch).toHaveBeenCalledWith(buildLyricsRoute('track-1'));
  });

  it('does not prefetch the lyrics route when the track has no lyrics', () => {
    setPlaying({ artistName: 'DJ Cool', hasLyrics: false });

    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    expect(screen.queryByRole('button', { name: 'Lyrics' })).toBeNull();
    expect(prefetch).not.toHaveBeenCalled();
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

  it('prefetches the lyrics route once when a track with lyrics activates', () => {
    setPlaying({ hasLyrics: true });

    const { rerender } = render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );

    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(buildLyricsRoute('track-1'));

    // Re-rendering with the same track must not re-prefetch.
    rerender(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );
    expect(prefetch).toHaveBeenCalledTimes(1);

    // A new active track is a new intent — prefetch its lyrics route.
    setPlaying({ hasLyrics: true, activeTrackId: 'track-2' });
    rerender(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );
    expect(prefetch).toHaveBeenCalledTimes(2);
    expect(prefetch).toHaveBeenLastCalledWith(buildLyricsRoute('track-2'));
  });

  it('does not prefetch the lyrics route for tracks without lyrics or with none active', () => {
    setPlaying({ hasLyrics: false });
    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('does not prefetch the lyrics route while already on it', () => {
    setPlaying({ hasLyrics: true });
    pathname = buildLyricsRoute('track-1');
    render(
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <PersistentAudioBar />
      </AppFlagProvider>
    );
    expect(prefetch).not.toHaveBeenCalled();
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

  it('collapses the dock after closing to mini (panel slides back down)', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    await user.click(getPlayerVisibilityToggle());

    // The dock collapses to zero height — the sidebar bridge owns the mini
    // chrome (JOV-3511), so nothing else remains below the panel.
    expect(screen.getByTestId('audio-surface-expanded-shell')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await waitFor(() => {
      expect(getDock()).toHaveAttribute('data-state', 'closed');
      expect(getDock().style.maxHeight).toBe('0px');
    });
  });

  it('certifies repeated pointer and keyboard audio reveal cycles', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');

    getPlayerVisibilityToggle().focus();
    await detectReversibleControl({
      name: 'persistent audio-player reveal',
      states: ['open', 'closed'],
      activationSequence: ['pointer', 'keyboard', 'keyboard', 'keyboard'],
      observe: () => ({
        state:
          getPlayerVisibilityToggle().getAttribute('aria-expanded') === 'true'
            ? 'open'
            : 'closed',
      }),
      activate: async via => {
        getPlayerVisibilityToggle().focus();
        if (via === 'pointer') {
          await user.click(getPlayerVisibilityToggle());
        } else {
          fireEvent.keyDown(window, { key: '`' });
        }
      },
      assertContinuity: observation => {
        const expanded = String(observation.state === 'open');
        expect(getPlayerVisibilityToggle()).toHaveAttribute(
          'aria-expanded',
          expanded
        );
        expect(getPlayerVisibilityToggle()).toHaveAccessibleName(
          observation.state === 'open' ? 'Hide Player' : 'Show Player'
        );
        expect(getPlayerVisibilityToggle()).toHaveFocus();
        expect(expandedSurface).toHaveAttribute(
          'aria-hidden',
          String(observation.state === 'closed')
        );
      },
    });

    await waitFor(() => {
      expect(getDock()).toHaveAttribute('data-state', 'open');
      expect(expandedSurface).toHaveAttribute('aria-hidden', 'false');
    });
  });

  it('docks the expanded shell flat — no card border, radius, or shadow', () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const expandedSurface = screen.getByTestId('audio-surface-expanded-shell');
    expect(expandedSurface.className).not.toMatch(/\bborder\b/);
    expect(expandedSurface.className).not.toMatch(/\brounded\b/);
    expect(expandedSurface.className).not.toMatch(/shadow-\[/);
  });

  it('publishes compact canonical chrome state while closed and clears on unmount', async () => {
    const user = userEvent.setup();
    setPlaying({ artistName: 'DJ Cool' });

    const { unmount } = render(<PersistentAudioBar />);

    expect(getAudioChromeSnapshot()).toEqual({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });

    await user.click(getPlayerVisibilityToggle());

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

    fireEvent.keyDown(window, { key: ' ' });
    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Midnight Drive',
    });

    fireEvent.keyDown(window, { key: 'w' });
    expect(
      screen.getByRole('button', { name: 'Hide waveform' })
    ).toBeInTheDocument();

    toggleTrack.mockClear();
    fireEvent.keyDown(window, { key: 'l' });
    expect(push).toHaveBeenCalledWith(
      buildLyricsRoute('track-1', { from: APP_ROUTES.CHAT })
    );
    expect(toggleTrack).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: '`' });
    // Backtick toggles the player closed; mini chrome lives in the sidebar.
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

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(push).toHaveBeenCalledWith(
      resolveLyricsReturnRoute(searchParams.get('from'), APP_ROUTES.CHAT)
    );
  });

  it('cinematically reveals the docked player on first play', async () => {
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const dock = getDock();
    const content = getDockContent();

    await waitFor(() => {
      expect(dock).toHaveAttribute('data-state', 'open');
    });

    // Cinematic tier reveal: height animates open with the cinematic
    // duration/easing; the content lands fully opaque, in place, interactive.
    expect(dock.style.maxHeight).toBe('var(--app-shell-audio-bar-max-height)');
    expect(dock.style.transition).toContain(
      'var(--ds-motion-cinematic-duration)'
    );
    expect(content.style.transform).toBe('translateY(0)');
    expect(content.style.opacity).toBe('1');
    expect(content.style.pointerEvents).toBe('auto');
  });

  it('animates the dock height 0 → player height so only the panel bottom moves', async () => {
    const { rerender } = render(<PersistentAudioBar />);

    // Idle: dock collapsed, zero reserved height.
    const dock = getDock();
    expect(dock).toHaveAttribute('data-state', 'closed');
    expect(dock.style.maxHeight).toBe('0px');

    setPlaying({ artistName: 'DJ Cool' });
    rerender(<PersistentAudioBar />);

    await waitFor(() => {
      expect(dock.style.maxHeight).toBe(
        'var(--app-shell-audio-bar-max-height)'
      );
    });
    expect(dock).toHaveAttribute('data-state', 'open');
  });

  it('snaps the dock open instantly under reduced motion', () => {
    mockPrefersReducedMotion = true;
    setPlaying({ artistName: 'DJ Cool' });

    render(<PersistentAudioBar />);

    const dock = getDock();
    const content = getDockContent();

    // No transition ever paints — the dock is already in place.
    expect(dock.style.transition).toBe('none');
    expect(content.style.transition).toBe('none');
    expect(content.style.transform).toBe('translateY(0)');
    expect(content.style.opacity).toBe('1');
  });

  describe('media canvas transport (JOV-7240)', () => {
    const canvasController = {
      toggle: vi.fn(),
      seek: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
    };
    let unregisterCanvas: (() => void) | null = null;

    function registerCanvas() {
      act(() => {
        unregisterCanvas = registerMediaCanvasTransport(canvasController);
      });
    }

    function publishCanvas(
      overrides: Partial<MediaCanvasTransportSnapshot> = {}
    ) {
      act(() => {
        publishMediaCanvasTransport({
          title: 'Clip One',
          index: 0,
          count: 3,
          isVideo: true,
          isPlaying: true,
          currentTime: 12,
          duration: 40,
          hasNext: true,
          hasPrevious: true,
          ...overrides,
        });
      });
    }

    beforeEach(() => {
      unregisterCanvas?.();
      unregisterCanvas = null;
      canvasController.toggle.mockClear();
      canvasController.seek.mockClear();
      canvasController.next.mockClear();
      canvasController.previous.mockClear();
    });

    it('fills the dock with the canvas transport even without an audio track', () => {
      registerCanvas();
      render(<PersistentAudioBar />);

      // No published snapshot yet — the dock stays empty.
      expect(screen.queryByTestId('media-canvas-dock')).toBeNull();

      publishCanvas();

      const rows = screen.getAllByTestId('media-canvas-dock');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(within(row).getByText('Clip One')).toBeInTheDocument();
        expect(within(row).getByText('1 / 3')).toBeInTheDocument();
      }
    });

    it('wires the dock play/pause, next, and previous controls to the canvas controller', async () => {
      const user = userEvent.setup();
      registerCanvas();
      render(<PersistentAudioBar />);
      publishCanvas();

      await user.click(
        screen.getAllByRole('button', { name: 'Pause video' })[0]
      );
      await user.click(screen.getAllByRole('button', { name: 'Next Item' })[0]);
      await user.click(
        screen.getAllByRole('button', { name: 'Previous Item' })[0]
      );

      expect(canvasController.toggle).toHaveBeenCalledTimes(1);
      expect(canvasController.next).toHaveBeenCalledTimes(1);
      expect(canvasController.previous).toHaveBeenCalledTimes(1);
    });

    it('wires the dock seek bar to the canvas controller', () => {
      registerCanvas();
      render(<PersistentAudioBar />);
      publishCanvas();

      fireEvent.change(screen.getAllByTestId('seek-bar')[0], {
        target: { value: '22' },
      });

      expect(canvasController.seek).toHaveBeenCalledWith(22);
    });

    it('hides video-only controls for photo items but keeps item stepping', () => {
      registerCanvas();
      render(<PersistentAudioBar />);
      publishCanvas({ isVideo: false, isPlaying: false });

      for (const row of screen.getAllByTestId('media-canvas-dock')) {
        expect(within(row).getByText('1 / 3 · Photo')).toBeInTheDocument();
        expect(
          within(row).queryByRole('button', { name: /video/i })
        ).toBeNull();
        expect(
          within(row).getByRole('button', { name: 'Next Item' })
        ).toBeInTheDocument();
        expect(
          within(row).getByRole('button', { name: 'Previous Item' })
        ).toBeInTheDocument();
      }
      expect(screen.queryByTestId('seek-bar')).toBeNull();
    });

    it('replaces the audio transport in the dock while the canvas owns playback', () => {
      setPlaying({ artistName: 'DJ Cool' });
      registerCanvas();
      render(<PersistentAudioBar />);
      publishCanvas();

      expect(screen.queryByTestId('audio-surface-expanded-shell')).toBeNull();
      expect(screen.getAllByTestId('media-canvas-dock').length).toBeGreaterThan(
        0
      );
      expect(getAudioChromeSnapshot()).toEqual({
        activeTrackId: 'track-1',
        compactPlayerVisible: false,
        fullPlayerVisible: true,
      });
    });

    it('clears the dock row when the canvas session unregisters', () => {
      registerCanvas();
      render(<PersistentAudioBar />);
      publishCanvas();
      expect(screen.getAllByTestId('media-canvas-dock').length).toBeGreaterThan(
        0
      );

      act(() => {
        unregisterCanvas?.();
        unregisterCanvas = null;
      });

      expect(screen.queryByTestId('media-canvas-dock')).toBeNull();
    });
  });
});
