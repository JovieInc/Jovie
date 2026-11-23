'use client';

import { act } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/** A tiny stand-in for the shared track player store, driven by the tests. */
const base = {
  activeTrackId: null as string | null,
  isPlaying: false,
  playbackStatus: 'idle' as 'idle' | 'playing' | 'paused',
  lastErrorReason: null,
  currentTime: 0,
  duration: 30,
  trackTitle: null as string | null,
  releaseTitle: null,
  artistName: null as string | null,
  artworkUrl: null,
  hasLyrics: false,
  bpm: null,
  musicalKey: null,
  queueLength: 0,
  queueIndex: -1,
  hasNext: false,
  hasPrevious: false,
};
export type HarnessPlayback = typeof base;

let state: HarnessPlayback = { ...base };
const listeners = new Set<() => void>();

export const playerActions = {
  toggleTrack: vi.fn().mockResolvedValue(undefined),
  playNext: vi.fn().mockResolvedValue(undefined),
  playPrevious: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  seek: vi.fn(),
  onError: vi.fn().mockReturnValue(() => {}),
};

export function resetPlayback() {
  state = { ...base };
  for (const action of Object.values(playerActions)) action.mockClear();
  playerActions.onError.mockReturnValue(() => {});
}

export function setPlayback(patch: Partial<HarnessPlayback>) {
  state = { ...state, ...patch };
  act(() => {
    for (const listener of listeners) listener();
  });
}

/** The user presses play on a track. */
export function playTrack(id = 'track-1', title = 'Midnight Drive') {
  setPlayback({
    activeTrackId: id,
    trackTitle: title,
    artistName: 'Maya Vale',
    isPlaying: true,
    playbackStatus: 'playing',
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Factory for `vi.mock` of release-sidebar/useTrackAudioPlayer. */
export function playerModule() {
  return {
    getTrackAudioState: () => state,
    subscribeTrackAudio: subscribe,
    useTrackAudioPlayer: () => ({
      playbackState: useSyncExternalStore(
        subscribe,
        () => state,
        () => state
      ),
      ...playerActions,
    }),
  };
}

/** Desktop buttons the user can reach: not inert, not aria-hidden, not mobile. */
export function reachable(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button')].filter(
    button =>
      !button.closest(
        '[inert],[aria-hidden="true"],.lg\\:hidden,[data-mobile-audio-surface]'
      )
  );
}

/** Every visible play/pause control of the desktop shell, whatever surface owns it. */
export function visiblePlayControls(): HTMLElement[] {
  return reachable().filter(button =>
    /^(Play|Pause)( video)?\b/.test(button.getAttribute('aria-label') ?? '')
  );
}
