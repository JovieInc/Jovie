'use client';

import { useCallback, useEffect, useState } from 'react';

interface AudioTrackSource {
  readonly id: string;
  readonly title: string;
  /** Required when loading a new track; omit when resuming the same track. */
  readonly audioUrl?: string;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
}

interface PlaybackState {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly playbackStatus: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  readonly lastErrorReason:
    | 'play_rejected'
    | 'media_error'
    | 'missing_source'
    | null;
  readonly currentTime: number;
  readonly duration: number;
  readonly trackTitle: string | null;
  readonly releaseTitle: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
}

let _audio: HTMLAudioElement | null = null;
/** Monotonically increasing token — guards against stale play() promises from prior track switches. */
let _playToken = 0;

/** Lazily create the Audio element — safe to call during SSR (returns null server-side). */
function getAudio(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'metadata';
    bindAudioEvents(_audio);
  }
  return _audio;
}

let state: PlaybackState = {
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

const listeners = new Set<() => void>();
const errorListeners = new Set<
  (reason: PlaybackState['lastErrorReason']) => void
>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(partial: Partial<PlaybackState>): void {
  state = { ...state, ...partial };
  notify();
}

function notifyPlaybackError(reason: PlaybackState['lastErrorReason']): void {
  for (const cb of errorListeners) {
    cb(reason);
  }
}

function handlePlaybackFailure(
  audio: HTMLAudioElement | null,
  reason: PlaybackState['lastErrorReason']
): void {
  if (audio) {
    audio.pause();
    audio.src = '';
  }
  setState({
    activeTrackId: null,
    isPlaying: false,
    playbackStatus: 'error',
    lastErrorReason: reason,
    currentTime: 0,
    duration: 0,
    trackTitle: null,
    releaseTitle: null,
    artistName: null,
    artworkUrl: null,
  });
  notifyPlaybackError(reason);
}

function bindAudioEvents(el: HTMLAudioElement): void {
  let lastNotifiedSecond = -1;
  el.addEventListener('timeupdate', () => {
    // Throttle to ~1 update/sec to reduce re-renders across all subscribers
    const sec = Math.floor(el.currentTime);
    if (sec === lastNotifiedSecond) return;
    lastNotifiedSecond = sec;
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });

  el.addEventListener('play', () =>
    setState({
      isPlaying: true,
      playbackStatus: 'playing',
      lastErrorReason: null,
    })
  );
  el.addEventListener('pause', () =>
    setState({
      isPlaying: false,
      playbackStatus: state.activeTrackId ? 'paused' : 'idle',
    })
  );
  el.addEventListener('ended', () =>
    setState({ isPlaying: false, playbackStatus: 'paused', currentTime: 0 })
  );
  el.addEventListener('loadedmetadata', () => {
    setState({
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  el.addEventListener('seeked', () => {
    lastNotifiedSecond = -1; // invalidate throttle so next timeupdate fires
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  el.addEventListener('error', () => {
    // Guard: only handle errors when a track is actively loaded.
    // The audio element can fire stale error events (e.g., after tab
    // backgrounding/resuming) even when src is already cleared.
    if (state.activeTrackId) {
      handlePlaybackFailure(el, 'media_error');
    }
  });
}

export function useTrackAudioPlayer() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>(state);

  useEffect(() => {
    const listener = () => setPlaybackState(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleTrack = useCallback(async (track: AudioTrackSource) => {
    const audio = getAudio();
    if (!audio) return;

    // Same track — toggle pause/resume
    if (state.activeTrackId === track.id) {
      if (audio.paused) {
        try {
          await audio.play();
        } catch (error) {
          handlePlaybackFailure(audio, 'play_rejected');
          throw error;
        }
      } else {
        audio.pause();
      }
      return;
    }

    // New track — cancel any in-flight play() from a prior switch
    if (!track.audioUrl) {
      handlePlaybackFailure(audio, 'missing_source');
      return;
    }
    const token = ++_playToken;
    audio.pause();
    audio.src = track.audioUrl;
    setState({
      activeTrackId: track.id,
      isPlaying: false,
      playbackStatus: 'loading',
      lastErrorReason: null,
      currentTime: 0,
      duration: 0,
      trackTitle: track.title,
      releaseTitle: track.releaseTitle ?? null,
      artistName: track.artistName ?? null,
      artworkUrl: track.artworkUrl ?? null,
    });
    try {
      await audio.play();
    } catch (error) {
      if (_playToken === token) {
        handlePlaybackFailure(audio, 'play_rejected');
      }
      throw error;
    }
    // Another toggle fired while this play() was in-flight. The newer call owns
    // the shared audio element now, so avoid pausing here.
    if (_playToken !== token) {
      return;
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = getAudio();
    if (!audio || !Number.isFinite(time)) return;
    if (!Number.isFinite(audio.duration) || audio.duration === 0) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  }, []);

  const stop = useCallback(() => {
    // Invalidate any in-flight play() from earlier toggleTrack calls
    _playToken += 1;
    const audio = getAudio();
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setState({
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
    });
  }, []);

  const onError = useCallback(
    (cb: (reason: PlaybackState['lastErrorReason']) => void) => {
      errorListeners.add(cb);
      return () => {
        errorListeners.delete(cb);
      };
    },
    []
  );

  return {
    playbackState,
    toggleTrack,
    seek,
    stop,
    onError,
  };
}
