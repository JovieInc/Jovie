import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLyricsRoute } from '@/constants/routes';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const togglerMock = vi.fn();
const seekMock = vi.fn();
const stopMock = vi.fn();
const onErrorMock = vi.fn(() => () => undefined);
const pushMock = vi.fn();
let pathname = '/app';

let _state: Record<string, unknown> = {
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
  hasLyrics: false,
};

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: _state,
    toggleTrack: togglerMock,
    seek: seekMock,
    stop: stopMock,
    onError: onErrorMock,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

import { ShellAudioBarBridge } from '@/components/organisms/ShellAudioBarBridge';

beforeEach(() => {
  togglerMock.mockReset();
  seekMock.mockReset();
  stopMock.mockReset();
  onErrorMock.mockReset();
  pushMock.mockReset();
  onErrorMock.mockImplementation(() => () => undefined);
  pathname = '/app';
  _state = {
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
    hasLyrics: false,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ShellAudioBarBridge', () => {
  it('renders nothing when no active track', () => {
    const { container } = render(<ShellAudioBarBridge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the AudioBar when a track is active', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      currentTime: 12,
      duration: 213,
      isPlaying: true,
    };
    render(<ShellAudioBarBridge />);
    expect(screen.getByLabelText(/Pause/)).toBeInTheDocument();
  });

  it('falls back to empty artist when artistName is null', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Solo',
      artistName: null,
      duration: 90,
    };
    render(<ShellAudioBarBridge />);
    // smoke render — no crash from null artist
    expect(screen.getByLabelText(/Play|Pause/)).toBeInTheDocument();
  });

  it('links lyrics to the active track when lyrics are flagged on and available', async () => {
    const user = userEvent.setup();
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      currentTime: 12,
      duration: 213,
      hasLyrics: true,
    };

    render(
      <AppFlagProvider
        initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1_LYRICS: true }}
      >
        <ShellAudioBarBridge />
      </AppFlagProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Lyrics' }));

    expect(pushMock).toHaveBeenCalledWith(buildLyricsRoute('track-1'));
  });

  it('keeps lyrics hidden when the active track has no lyrics', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      hasLyrics: false,
    };

    render(
      <AppFlagProvider
        initialFlags={{ ...APP_FLAG_DEFAULTS, DESIGN_V1_LYRICS: true }}
      >
        <ShellAudioBarBridge />
      </AppFlagProvider>
    );

    expect(screen.queryByRole('button', { name: 'Lyrics' })).toBeNull();
  });
});
