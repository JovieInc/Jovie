'use client';

// @coverage-via apps/web/lib/desktop/electron-native-state.test.ts

import { getRawElectronAPI } from './electron-runtime';

/** Old binaries and browsers keep their existing visual behavior. */
export function observeDesktopVisualActivity(
  callback: (active: boolean) => void
): () => void {
  const api = getRawElectronAPI();
  if (
    typeof api?.getVisualActivity !== 'function' ||
    typeof api.onVisualActivity !== 'function'
  ) {
    return () => undefined;
  }
  let disposed = false;
  let revision = 0;
  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = api.onVisualActivity(active => {
      if (disposed || typeof active !== 'boolean') return;
      revision += 1;
      callback(active);
    });
    const requestedRevision = revision;
    void api
      .getVisualActivity()
      .then(active => {
        // A live event wins over an older asynchronous snapshot.
        if (
          !disposed &&
          revision === requestedRevision &&
          typeof active === 'boolean'
        )
          callback(active);
      })
      .catch(() => undefined);
  } catch {
    // Optional stale bridge methods cannot break the transcript.
  }
  return () => {
    disposed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}

/**
 * Native full-screen transitions (JOV-8940). macOS hides the traffic lights
 * in full screen, so the renderer collapses its native-light reserve. The
 * snapshot closes the initial-state race; a live event always wins.
 */
export function observeDesktopFullScreen(
  callback: (isFullScreen: boolean) => void
): () => void {
  const api = getRawElectronAPI();
  if (
    typeof api?.getFullScreenState !== 'function' ||
    typeof api.onFullScreenChanged !== 'function'
  ) {
    return () => undefined;
  }
  let disposed = false;
  let revision = 0;
  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = api.onFullScreenChanged(isFullScreen => {
      if (disposed || typeof isFullScreen !== 'boolean') return;
      revision += 1;
      callback(isFullScreen);
    });
    const requestedRevision = revision;
    void api
      .getFullScreenState()
      .then(isFullScreen => {
        // A live event wins over an older asynchronous snapshot.
        if (
          !disposed &&
          revision === requestedRevision &&
          typeof isFullScreen === 'boolean'
        )
          callback(isFullScreen);
      })
      .catch(() => undefined);
  } catch {
    // Optional stale bridge methods cannot break the title row.
  }
  return () => {
    disposed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
  };
}
