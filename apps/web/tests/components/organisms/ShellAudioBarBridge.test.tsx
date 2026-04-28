import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const togglerMock = vi.fn();
const seekMock = vi.fn();
const stopMock = vi.fn();
const onErrorMock = vi.fn(() => () => undefined);

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
};

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
  onErrorMock.mockImplementation(() => () => undefined);
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
});
