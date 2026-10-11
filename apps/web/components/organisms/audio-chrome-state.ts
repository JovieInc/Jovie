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

/**
 * Expand-request channel (JOV-6680). The full player owns its own open state
 * inside PersistentAudioBar, so chrome that wants to reopen it — e.g. the
 * sidebar mini card — cannot set the snapshot directly (the player would
 * overwrite it on its next publish). Instead, mini chrome bumps this counter;
 * the player subscribes and opens itself, then publishes the new snapshot.
 */
let fullPlayerExpandRequests = 0;

export function requestFullAudioPlayer(): void {
  fullPlayerExpandRequests += 1;
  emitAudioChromeChange();
}

function getFullPlayerExpandRequests(): number {
  return fullPlayerExpandRequests;
}

export function useFullAudioPlayerExpandRequests(): number {
  return useSyncExternalStore(
    subscribeAudioChrome,
    getFullPlayerExpandRequests,
    getFullPlayerExpandRequests
  );
}

/**
 * Media-canvas transport channel (JOV-7240). While MediaCanvasViewer is open
 * it registers a controller and publishes playback state, so the shell audio
 * dock becomes the transport for canvas video (play/pause, scrub, time) and
 * its next/previous buttons step through photo and video items alike. Only
 * one registration is live at a time — the canvas is the playback owner, and
 * starting a canvas video pauses the audio track.
 */
export interface MediaCanvasTransportSnapshot {
  readonly title: string;
  readonly index: number;
  readonly count: number;
  readonly isVideo: boolean;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export interface MediaCanvasTransportController {
  readonly toggle: () => void;
  readonly seek: (time: number) => void;
  readonly next: () => void;
  readonly previous: () => void;
}

let mediaCanvasSnapshot: MediaCanvasTransportSnapshot | null = null;
let mediaCanvasController: MediaCanvasTransportController | null = null;

export function getMediaCanvasTransportSnapshot(): MediaCanvasTransportSnapshot | null {
  return mediaCanvasSnapshot;
}

export function registerMediaCanvasTransport(
  controller: MediaCanvasTransportController
): () => void {
  mediaCanvasController = controller;
  mediaCanvasSnapshot = null;
  emitAudioChromeChange();
  return () => {
    if (mediaCanvasController !== controller) return;
    mediaCanvasController = null;
    mediaCanvasSnapshot = null;
    emitAudioChromeChange();
  };
}

export function publishMediaCanvasTransport(
  next: MediaCanvasTransportSnapshot
): void {
  if (!mediaCanvasController) return;
  mediaCanvasSnapshot = next;
  emitAudioChromeChange();
}

export function useMediaCanvasTransport(): MediaCanvasTransportSnapshot | null {
  return useSyncExternalStore(
    subscribeAudioChrome,
    getMediaCanvasTransportSnapshot,
    getMediaCanvasTransportSnapshot
  );
}

/** Dock-side commands — no-ops when no canvas session is registered. */
export const mediaCanvasTransport = {
  toggle(): void {
    mediaCanvasController?.toggle();
  },
  seek(time: number): void {
    mediaCanvasController?.seek(time);
  },
  next(): void {
    mediaCanvasController?.next();
  },
  previous(): void {
    mediaCanvasController?.previous();
  },
} as const;
