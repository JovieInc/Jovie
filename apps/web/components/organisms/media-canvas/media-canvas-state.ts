'use client';

import { useSyncExternalStore } from 'react';
import type { MediaCanvasItem } from './MediaCanvasViewer';

export interface MediaCanvasSnapshot {
  readonly items: readonly MediaCanvasItem[];
  readonly index: number | null;
}

const EMPTY_MEDIA_CANVAS: MediaCanvasSnapshot = { items: [], index: null };
let snapshot = EMPTY_MEDIA_CANVAS;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: MediaCanvasSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function openMediaCanvas(
  items: readonly MediaCanvasItem[],
  index = 0
): void {
  const lastIndex = Math.max(0, items.length - 1);
  publish({ items, index: Math.max(0, Math.min(index, lastIndex)) });
}

export function setMediaCanvasIndex(index: number): void {
  if (snapshot.index === null) return;
  const lastIndex = Math.max(0, snapshot.items.length - 1);
  publish({
    ...snapshot,
    index: Math.max(0, Math.min(index, lastIndex)),
  });
}

export function closeMediaCanvas(): void {
  if (snapshot.index === null) return;
  publish(EMPTY_MEDIA_CANVAS);
}

export function getMediaCanvasSnapshot(): MediaCanvasSnapshot {
  return snapshot;
}

export function useMediaCanvasSnapshot(): MediaCanvasSnapshot {
  return useSyncExternalStore(
    subscribe,
    getMediaCanvasSnapshot,
    () => EMPTY_MEDIA_CANVAS
  );
}
