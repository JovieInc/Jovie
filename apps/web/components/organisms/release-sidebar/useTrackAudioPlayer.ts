'use client';

import { useCallback, useEffect, useState } from 'react';

interface AudioTrackSource {
  readonly id: string;
  readonly title: string;
  readonly audioUrl: string;
  readonly releaseTitle?: string;
  readonly artistName?: string;
  readonly artworkUrl?: string | null;
}

interface PlaybackState {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly trackTitle: string | null;
  readonly releaseTitle: string | null;
  readonly artistName: string | null;
  readonly artworkUrl: string | null;
}

let _audio: HTMLAudioElement | null = null;

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
  currentTime: 0,
  duration: 0,
  trackTitle: null,
  releaseTitle: null,
  artistName: null,
  artworkUrl: null,
};

const listeners = new Set<() => void>();
const errorListeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(partial: Partial<PlaybackState>): void {
  state = { ...state, ...partial };
  notify();
}

function bindAudioEvents(el: HTMLAudioElement): void {
  el.addEventListener('timeupdate', () => {
    setState({
      currentTime: el.currentTime,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });

  el.addEventListener('play', () => setState({ isPlaying: true }));
  el.addEventListener('pause', () => setState({ isPlaying: false }));
  el.addEventListener('ended', () =>
    setState({ isPlaying: false, currentTime: 0 })
  );
  el.addEventListener('loadedmetadata', () => {
    setState({
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  });
  el.addEventListener('error', () => {
    setState({
      activeTrackId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      trackTitle: null,
      releaseTitle: null,
      artistName: null,
      artworkUrl: null,
    });
    for (const cb of errorListeners) {
      cb();
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

    if (state.activeTrackId === track.id) {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    audio.src = track.audioUrl;
    setState({
      activeTrackId: track.id,
      currentTime: 0,
      duration: 0,
      trackTitle: track.title,
      releaseTitle: track.releaseTitle ?? null,
      artistName: track.artistName ?? null,
      artworkUrl: track.artworkUrl ?? null,
    });
    await audio.play();
  }, []);

  const seek = useCallback((time: number) => {
    const audio = getAudio();
    if (!audio || !Number.isFinite(time)) return;
    if (!Number.isFinite(audio.duration) || audio.duration === 0) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
  }, []);

  const onError = useCallback((cb: () => void) => {
    errorListeners.add(cb);
    return () => {
      errorListeners.delete(cb);
    };
  }, []);

  return {
    playbackState,
    toggleTrack,
    seek,
    onError,
  };
}
