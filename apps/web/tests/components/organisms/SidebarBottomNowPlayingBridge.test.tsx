import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';

let _flag = false;
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

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => _flag,
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: _state,
    toggleTrack: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  }),
}));

import { SidebarBottomNowPlayingBridge } from '@/components/organisms/SidebarBottomNowPlayingBridge';

beforeEach(() => {
  resetAudioChromeSnapshot();
  _flag = false;
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
  resetAudioChromeSnapshot();
  vi.clearAllMocks();
});

describe('SidebarBottomNowPlayingBridge', () => {
  it('renders nothing when DESIGN_V1 is off', () => {
    _flag = false;
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
    };
    const { container } = render(<SidebarBottomNowPlayingBridge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no active track even with flag on', () => {
    _flag = true;
    const { container } = render(<SidebarBottomNowPlayingBridge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when flag on and a track is active', () => {
    _flag = true;
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    render(<SidebarBottomNowPlayingBridge />);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('hides when the persistent compact player owns the active track', () => {
    _flag = true;
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    setAudioChromeSnapshot({
      activeTrackId: 'track-1',
      compactPlayerVisible: true,
      fullPlayerVisible: false,
    });

    const { container } = render(<SidebarBottomNowPlayingBridge />);

    expect(container.firstChild).toBeNull();
  });

  it('still renders when compact state belongs to a different track', () => {
    _flag = true;
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    setAudioChromeSnapshot({
      activeTrackId: 'track-2',
      compactPlayerVisible: true,
      fullPlayerVisible: false,
    });

    render(<SidebarBottomNowPlayingBridge />);

    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
  });
});
