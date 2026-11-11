'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** Local midnight of the viewer's today, in epoch ms. */
export function localTodayMs(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * The viewer's today, read only in the browser. The server renders in its own
 * time zone, so a today it computed could mark a different day than the
 * viewer's and fail hydration. Server render and hydration get null (no day is
 * marked); the browser's day is marked on the first client render after.
 */
export function useClientTodayMs(): number | null {
  return useSyncExternalStore(subscribe, localTodayMs, () => null);
}
