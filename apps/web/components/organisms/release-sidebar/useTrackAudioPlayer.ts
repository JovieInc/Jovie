'use client';

import { useCallback, useEffect, useState } from 'react';

interface AudioTrackSource {
  readonly id: string;
  readonly title: string;
  readonly audioUrl: string;
}

interface PlaybackState {
  readonly activeTrackId: string | null;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
}

const audioElement = new Audio();
audioElement.preload = 'metadata';

let state: PlaybackState = {
  activeTrackId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(partial: Partial<PlaybackState>): void {
  state = { ...state, ...partial };
  notify();
}

function bindAudioEvents(): void {
  audioElement.addEventListener('timeupdate', () => {
    setState({
      currentTime: audioElement.currentTime,
      duration: Number.isFinite(audioElement.duration)
        ? audioElement.duration
        : 0,
    });
  });

  audioElement.addEventListener('play', () => setState({ isPlaying: true }));
  audioElement.addEventListener('pause', () => setState({ isPlaying: false }));
  audioElement.addEventListener('ended', () =>
    setState({ isPlaying: false, currentTime: 0 })
  );
  audioElement.addEventListener('loadedmetadata', () => {
    setState({
      duration: Number.isFinite(audioElement.duration)
        ? audioElement.duration
        : 0,
    });
  });
}

bindAudioEvents();

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
    if (state.activeTrackId === track.id) {
      if (audioElement.paused) {
        await audioElement.play();
      } else {
        audioElement.pause();
      }
      return;
    }

    audioElement.src = track.audioUrl;
    setState({
      activeTrackId: track.id,
      currentTime: 0,
      duration: 0,
    });
    await audioElement.play();
  }, []);

  return {
    playbackState,
    toggleTrack,
  };
}
