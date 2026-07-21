import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
} from '@/components/organisms/audio-chrome-state';

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
    toggleTrack: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    onError: vi.fn(() => () => undefined),
  }),
}));

import { SidebarBottomNowPlayingBridge } from '@/components/organisms/SidebarBottomNowPlayingBridge';

beforeEach(() => {
  resetAudioChromeSnapshot();
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
    expect(
      document.querySelector('[data-shell-audio-surface="sidebar-compact"]')
    ).toHaveAttribute('data-state', 'visible');
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('reserves the slot when the persistent compact player owns the active track', () => {
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

    render(<SidebarBottomNowPlayingBridge />);

    const slot = document.querySelector(
      '[data-shell-audio-surface="sidebar-compact"]'
    );
    expect(slot).toHaveAttribute('data-state', 'reserved');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).toHaveAttribute('inert');
    expect(slot).toHaveClass('opacity-0');
    expect(slot).not.toHaveClass('invisible');
    expect(
      screen.queryByRole('button', { name: 'Play' })
    ).not.toBeInTheDocument();
  });

  it('reserves the slot when the full/expanded persistent player owns the active track (JOV-3511)', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    // Default expanded-bar state (and what the legacy variant publishes):
    // the full player is visible, the compact player is not.
    setAudioChromeSnapshot({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });

    render(<SidebarBottomNowPlayingBridge />);

    const slot = document.querySelector(
      '[data-shell-audio-surface="sidebar-compact"]'
    );
    expect(slot).toHaveAttribute('data-state', 'reserved');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).toHaveAttribute('inert');
    expect(
      screen.queryByRole('button', { name: 'Play' })
    ).not.toBeInTheDocument();
  });

  it('keeps the reserved slot height fixed so hiding never shifts layout', () => {
    _state = {
      ..._state,
      activeTrackId: 'track-1',
      trackTitle: 'Lost in the Light',
      artistName: 'Bahamas',
      isPlaying: false,
    };
    setAudioChromeSnapshot({
      activeTrackId: 'track-1',
      compactPlayerVisible: false,
      fullPlayerVisible: true,
    });

    render(<SidebarBottomNowPlayingBridge />);

    const slot = document.querySelector(
      '[data-shell-audio-surface="sidebar-compact"]'
    );
    // Height-preserving hide: the fixed compact-height slot stays mounted
    // (no h-0 / hidden / collapse), only opacity + interactivity change.
    expect(slot).toHaveClass('h-(--app-shell-audio-compact-height)');
    expect(slot).toHaveClass('opacity-0');
    expect(slot).not.toHaveClass('h-0');
    expect(slot).not.toHaveClass('hidden');
    expect(slot).not.toHaveClass('invisible');
  });

  it('still renders when compact state belongs to a different track', () => {
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
