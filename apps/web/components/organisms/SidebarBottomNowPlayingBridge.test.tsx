import { act, fireEvent, render, screen } from '@testing-library/react';
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

import { SidebarBottomNowPlayingBridge } from '@/components/organisms/SidebarBottomNowPlayingBridge';

beforeEach(() => {
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
  vi.unstubAllGlobals();
});

describe('SidebarBottomNowPlayingBridge', () => {
  it('keeps the detached dock above overlapping composer and visual keyboard, clamped in a short viewport', () => {
    _state = { ..._state, activeTrackId: 'track-1', trackTitle: 'Sample' };
    vi.stubGlobal('innerHeight', 700);
    const viewport = Object.assign(new EventTarget(), {
      height: 700,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', viewport);
    const composer = document.createElement('div');
    composer.dataset.testid = 'chat-composer-surface';
    let top = 500;
    vi.spyOn(composer, 'getBoundingClientRect').mockImplementation(() => ({
      top,
      left: 0,
      right: 1024,
      width: 1024,
      bottom: top + 120,
      height: 120,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }));
    document.body.append(composer);
    const { unmount } = render(<SidebarBottomNowPlayingBridge detached />);
    const dock = document.querySelector(
      '[data-shell-audio-surface="sidebar-compact"]'
    );
    expect(dock).toHaveStyle({ bottom: '208px' });
    act(() => {
      viewport.height = 400;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(dock).toHaveStyle({ bottom: '308px' });
    act(() => {
      vi.stubGlobal('innerHeight', 320);
      viewport.height = 320;
      top = 200;
      fireEvent.resize(window);
    });
    expect(dock).toHaveStyle({ bottom: '128px' });
    unmount();
    composer.remove();
  });
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
