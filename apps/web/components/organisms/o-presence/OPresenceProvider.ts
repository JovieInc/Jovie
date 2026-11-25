'use client';

import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import {
  useAudioChromeSnapshot,
  useMediaCanvasTransport,
} from '../audio-chrome-state';
import {
  selectNowPlaying,
  useTrackAudioSnapshot,
} from '../release-sidebar/useTrackAudioSnapshot';
import {
  IDLE_O_INPUTS,
  type OState,
  type OStateInputs,
  resolveOState,
} from './o-state';

export interface ONowPlaying {
  readonly title: string;
  readonly artist: string | null;
  readonly isPlaying: boolean;
}

export interface OPresenceValue {
  readonly state: OState;
  /** Set while a track is loaded; the sidebar O reads its label from here. */
  readonly nowPlaying: ONowPlaying | null;
}

const IDLE: OPresenceValue = {
  state: resolveOState(IDLE_O_INPUTS),
  nowPlaying: null,
};

const OPresenceContext = createContext<OPresenceValue | null>(null);

/**
 * Gathers the shell's facts once and resolves the O's state. It reads playback
 * through the narrow snapshot (never `currentTime`), so progress ticks do not
 * re-render it. Slices 5 to 7 add their inputs here.
 */
export function OPresenceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const track = useTrackAudioSnapshot(selectNowPlaying);
  const chrome = useAudioChromeSnapshot();
  const canvas = useMediaCanvasTransport();

  const audioActive = Boolean(track.activeTrackId && track.trackTitle);
  const fullPlayerOpen =
    chrome.fullPlayerVisible && chrome.activeTrackId === track.activeTrackId;
  const hasCanvas = canvas !== null;

  const value = useMemo<OPresenceValue>(() => {
    const inputs: OStateInputs = {
      ...IDLE_O_INPUTS,
      canvasTransport: hasCanvas,
      fullPlayerOpen,
      audioActive,
      isPlaying: track.isPlaying,
    };
    return {
      state: resolveOState(inputs),
      nowPlaying:
        audioActive && track.trackTitle
          ? {
              title: track.trackTitle,
              artist: track.artistName,
              isPlaying: track.isPlaying,
            }
          : null,
    };
  }, [
    hasCanvas,
    fullPlayerOpen,
    audioActive,
    track.isPlaying,
    track.trackTitle,
    track.artistName,
  ]);

  return createElement(OPresenceContext.Provider, { value }, children);
}

export function useOPresence(): OPresenceValue {
  return useContext(OPresenceContext) ?? IDLE;
}
