import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { stop, toggleTrack } = vi.hoisted(() => ({
  stop: vi.fn(),
  toggleTrack: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: _state,
    toggleTrack,
    seek: vi.fn(),
    stop,
    onError: vi.fn(() => () => undefined),
  }),
}));

import {
  resetMediaTransportSnapshot,
  setMediaTransportSnapshot,
} from '@/components/organisms/audio-chrome-state';
import { SidebarBottomNowPlayingBridge } from '@/components/organisms/SidebarBottomNowPlayingBridge';

beforeEach(() => {
  resetMediaTransportSnapshot();
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
  resetMediaTransportSnapshot();
  vi.clearAllMocks();
});

describe('SidebarBottomNowPlayingBridge', () => {
  it('renders nothing when no active track is present', () => {
    const { container } = render(<SidebarBottomNowPlayingBridge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when a production track is active', () => {
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

  it('keeps identity visible when the full bottom player is open', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    render(<SidebarBottomNowPlayingBridge />);

    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('routes play and pause through toggleTrack', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    render(<SidebarBottomNowPlayingBridge />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Lost in the Light',
    });
  });

  it('yields the compact audio controls while the canvas owns transport', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    setMediaTransportSnapshot({
      ownerId: 'canvas-test',
      itemId: 'video:/walkthrough.mp4:0',
      kind: 'video',
      label: 'Walkthrough',
      index: 0,
      itemCount: 1,
      status: 'playing',
      currentTime: 1,
      duration: 10,
      hasPrevious: false,
      hasNext: false,
      togglePlayback: vi.fn(),
      pausePlayback: vi.fn(),
      seek: vi.fn(),
      previous: vi.fn(),
      next: vi.fn(),
      retry: vi.fn(),
    });

    render(<SidebarBottomNowPlayingBridge />);

    expect(
      screen
        .getByText('Lost in the Light')
        .closest('[data-shell-audio-surface]')
    ).toHaveAttribute('data-state', 'reserved');
  });

  it('wires the compact dismiss control to stop exactly once', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: true,
    };
    render(<SidebarBottomNowPlayingBridge />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Player' }));

    expect(stop).toHaveBeenCalledOnce();
  });

  it('renders the collapsed artwork-only variant', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      artworkUrl: 'https://example.com/art.jpg',
      isPlaying: true,
    };
    render(<SidebarBottomNowPlayingBridge collapsed />);

    expect(
      screen.getByRole('button', { name: 'Pause Lost in the Light' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Bahamas')).not.toBeInTheDocument();
  });
});
