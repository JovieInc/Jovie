'use client';

import { useRef, useSyncExternalStore } from 'react';
import {
  getTrackAudioState,
  type PlaybackState,
  subscribeTrackAudio,
  useTrackAudioPlayer,
} from './useTrackAudioPlayer';

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const keys = Object.keys(a) as (keyof T)[];
  return keys.every(key => Object.is(a[key], b[key]));
}

/**
 * Subscribe to a slice of the shared track player. The component re-renders
 * only when a selected field changes, so progress ticks (about 4 Hz) never
 * reach shell chrome that does not read `currentTime`.
 */
export function useTrackAudioSnapshot<T extends object>(
  select: (state: PlaybackState) => T
): T {
  const cache = useRef<T | null>(null);
  const getSnapshot = () => {
    const next = select(getTrackAudioState());
    if (cache.current && shallowEqual(cache.current, next)) {
      return cache.current;
    }
    cache.current = next;
    return next;
  };
  return useSyncExternalStore(subscribeTrackAudio, getSnapshot, getSnapshot);
}

export interface NowPlayingSlice {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly trackTitle: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
}

/** Everything the shell dock reads about playback, and never `currentTime`. */
export const selectNowPlaying = (state: PlaybackState): NowPlayingSlice => ({
  activeTrackId: state.activeTrackId,
  isPlaying: state.isPlaying,
  trackTitle: state.trackTitle,
  artistName: state.artistName,
  artworkUrl: state.artworkUrl,
});

/** Player actions without a playback subscription (`watch: false`). */
export function useTrackAudioActions() {
  const { toggleTrack, stop } = useTrackAudioPlayer(false);
  return { toggleTrack, stop };
}
