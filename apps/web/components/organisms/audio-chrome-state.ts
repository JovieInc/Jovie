'use client';

import { useSyncExternalStore } from 'react';

export interface AudioChromeSnapshot {
  readonly activeTrackId: string | null;
  readonly compactPlayerVisible: boolean;
  readonly fullPlayerVisible: boolean;
}

export type MediaTransportStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error';

/**
 * Transport published by the full-canvas viewer. PersistentAudioBar renders
 * this through the same ShellAudioDock as audio, so there is only one visible
 * playback surface even though the dock moves into the native dialog layer.
 */
export interface MediaTransportSnapshot {
  readonly ownerId: string;
  readonly itemId: string;
  readonly kind: 'image' | 'video';
  readonly label: string;
  readonly index: number;
  readonly itemCount: number;
  readonly status: MediaTransportStatus;
  readonly currentTime: number;
  readonly duration: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly togglePlayback?: () => void;
  readonly pausePlayback?: () => void;
  readonly seek?: (time: number) => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly retry: () => void;
}

const EMPTY_AUDIO_CHROME_SNAPSHOT: AudioChromeSnapshot = {
  activeTrackId: null,
  compactPlayerVisible: false,
  fullPlayerVisible: false,
};

let snapshot = EMPTY_AUDIO_CHROME_SNAPSHOT;
let mediaTransportSnapshot: MediaTransportSnapshot | null = null;
let mediaCanvasDockHost: { ownerId: string; element: HTMLElement } | null =
  null;
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

export function getMediaTransportSnapshot(): MediaTransportSnapshot | null {
  return mediaTransportSnapshot;
}

export function setMediaTransportSnapshot(next: MediaTransportSnapshot): void {
  mediaTransportSnapshot = next;
  emitAudioChromeChange();
}

export function resetMediaTransportSnapshot(ownerId?: string): void {
  if (
    mediaTransportSnapshot === null ||
    (ownerId && mediaTransportSnapshot.ownerId !== ownerId)
  ) {
    return;
  }
  mediaTransportSnapshot = null;
  emitAudioChromeChange();
}

export function useMediaTransportSnapshot(): MediaTransportSnapshot | null {
  return useSyncExternalStore(
    subscribeAudioChrome,
    getMediaTransportSnapshot,
    () => null
  );
}

/** Pause the canvas video before another playback owner starts. */
export function pauseActiveMediaTransport(): void {
  mediaTransportSnapshot?.pausePlayback?.();
}

export function setMediaCanvasDockHost(
  ownerId: string,
  element: HTMLElement
): void {
  if (
    mediaCanvasDockHost?.ownerId === ownerId &&
    mediaCanvasDockHost.element === element
  ) {
    return;
  }
  mediaCanvasDockHost = { ownerId, element };
  emitAudioChromeChange();
}

export function resetMediaCanvasDockHost(ownerId: string): void {
  if (mediaCanvasDockHost?.ownerId !== ownerId) return;
  mediaCanvasDockHost = null;
  emitAudioChromeChange();
}

export function getMediaCanvasDockHost(): HTMLElement | null {
  return mediaCanvasDockHost?.element ?? null;
}

export function useMediaCanvasDockHost(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeAudioChrome,
    getMediaCanvasDockHost,
    () => null
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
