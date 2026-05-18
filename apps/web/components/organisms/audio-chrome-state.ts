'use client';

import { useSyncExternalStore } from 'react';

export interface AudioChromeSnapshot {
  readonly activeTrackId: string | null;
  readonly compactPlayerVisible: boolean;
  readonly fullPlayerVisible: boolean;
}

const EMPTY_AUDIO_CHROME_SNAPSHOT: AudioChromeSnapshot = {
  activeTrackId: null,
  compactPlayerVisible: false,
  fullPlayerVisible: false,
};

let snapshot = EMPTY_AUDIO_CHROME_SNAPSHOT;
const listeners = new Set<() => void>();

function emitAudioChromeChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeAudioChrome(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioChromeSnapshot(): AudioChromeSnapshot {
  return snapshot;
}

export function setAudioChromeSnapshot(next: AudioChromeSnapshot): void {
  if (
    snapshot.activeTrackId === next.activeTrackId &&
    snapshot.compactPlayerVisible === next.compactPlayerVisible &&
    snapshot.fullPlayerVisible === next.fullPlayerVisible
  ) {
    return;
  }

  snapshot = next;
  emitAudioChromeChange();
}

export function resetAudioChromeSnapshot(): void {
  setAudioChromeSnapshot(EMPTY_AUDIO_CHROME_SNAPSHOT);
}

export function useAudioChromeSnapshot(): AudioChromeSnapshot {
  return useSyncExternalStore(
    subscribeAudioChrome,
    getAudioChromeSnapshot,
    getAudioChromeSnapshot
  );
}
