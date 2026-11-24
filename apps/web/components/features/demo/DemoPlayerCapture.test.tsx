import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetAudioChromeSnapshot,
  setAudioChromeSnapshot,
  useFullAudioPlayerExpandRequests,
} from '@/components/organisms/audio-chrome-state';
import {
  captureTrackPlayback,
  syncPlayingReleaseMetadata,
  useTrackAudioPlayer,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { DEMO_PLAYER_RELEASE, DemoPlayerCapture } from './DemoPlayerCapture';

let params = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

afterEach(() => {
  params = new URLSearchParams();
  resetAudioChromeSnapshot();
});

describe('demo player capture', () => {
  it.each(['1:18', 'bad', '99:59'])(
    'freezes canonical track metadata and restores idle on unmount (%s)',
    timestamp => {
      params.set('playerTimestamp', timestamp);
      const { result } = renderHook(useTrackAudioPlayer);
      const view = render(<DemoPlayerCapture />);
      expect(result.current.playbackState).toMatchObject({
        activeTrackId: DEMO_PLAYER_RELEASE.id,
        trackTitle: 'The Deep End',
        // ds-cert:credit-format: the player byline formats through the
        // canonical credit formatter, never a local '&' join.
        artistName: 'Tim White and Cosmic Gate',
        artworkUrl: '/img/releases/the-deep-end.jpg',
        isPlaying: true,
        playbackStatus: 'playing',
        duration: 214,
        currentTime: timestamp === '99:59' ? 214 : 78,
      });
      view.unmount();
      expect(result.current.playbackState.activeTrackId).toBeNull();
    }
  );

  it('does not overwrite another active player or let stale cleanup clear it', () => {
    const { result } = renderHook(useTrackAudioPlayer);
    let cleanup = () => {};
    act(() => {
      cleanup = captureTrackPlayback({ id: 'first', title: 'First' }, 100, -2);
    });
    expect(result.current.playbackState.currentTime).toBe(0);
    act(() =>
      captureTrackPlayback({ id: 'second', title: 'Second' }, 100, 20)()
    );
    expect(result.current.playbackState.activeTrackId).toBe('first');
    act(cleanup);
    let cleanupSecond = () => {};
    act(() => {
      cleanupSecond = captureTrackPlayback(
        { id: 'second', title: 'Second' },
        100,
        Number.NaN
      );
    });
    act(cleanup);
    expect(result.current.playbackState.activeTrackId).toBe('second');
    expect(result.current.playbackState.currentTime).toBe(0);
    act(cleanupSecond);
  });

  it.each([0, -1, Number.NaN])('rejects invalid duration %s', duration => {
    const { result } = renderHook(useTrackAudioPlayer);
    const before = result.current.playbackState;
    act(() =>
      captureTrackPlayback({ id: 'invalid', title: 'Invalid' }, duration, 10)()
    );
    expect(result.current.playbackState).toBe(before);
  });

  it('releases its frame after a same-track metadata update', () => {
    const mediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
      setPositionState: vi.fn(),
    };
    vi.stubGlobal('navigator', { mediaSession });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(readonly data: unknown) {}
      }
    );
    const { result } = renderHook(useTrackAudioPlayer);
    let cleanup = () => {};
    act(() => {
      cleanup = captureTrackPlayback(
        { id: 'capture', title: 'Capture' },
        100,
        30
      );
    });
    act(() => syncPlayingReleaseMetadata({ id: 'capture', title: 'Renamed' }));
    expect(result.current.playbackState.trackTitle).toBe('Renamed');
    expect(mediaSession.metadata).not.toBeNull();
    expect(mediaSession.playbackState).toBe('playing');
    act(cleanup);
    expect(result.current.playbackState.activeTrackId).toBeNull();
    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe('none');
    vi.unstubAllGlobals();
  });

  it('asks the shell for the full player once the dock shows the capture track', () => {
    // A play lands in the sidebar O and leaves the full player closed (#26754),
    // so the capture asks for the open dock it exists to show, exactly once.
    const requests = renderHook(useFullAudioPlayerExpandRequests);
    const before = requests.result.current;
    const view = render(<DemoPlayerCapture />);
    act(() =>
      setAudioChromeSnapshot({
        activeTrackId: 'another-track',
        compactPlayerVisible: true,
        fullPlayerVisible: false,
      })
    );
    expect(requests.result.current).toBe(before);
    act(() =>
      setAudioChromeSnapshot({
        activeTrackId: DEMO_PLAYER_RELEASE.id,
        compactPlayerVisible: true,
        fullPlayerVisible: false,
      })
    );
    expect(requests.result.current).toBe(before + 1);
    act(() =>
      setAudioChromeSnapshot({
        activeTrackId: DEMO_PLAYER_RELEASE.id,
        compactPlayerVisible: false,
        fullPlayerVisible: true,
      })
    );
    act(() =>
      setAudioChromeSnapshot({
        activeTrackId: DEMO_PLAYER_RELEASE.id,
        compactPlayerVisible: true,
        fullPlayerVisible: false,
      })
    );
    expect(requests.result.current).toBe(before + 1);
    view.unmount();
  });
});
