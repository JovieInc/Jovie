'use client';

import { useEffect } from 'react';
import { sendAppBooted } from '@/lib/desktop/electron-bridge';

/**
 * Fires the Electron desktop `app-booted` heartbeat signal on first mount.
 *
 * This component must be mounted in every Electron-rendered route tree so the
 * main process receives the signal and cancels the heartbeat watchdog. Without
 * it, the watchdog timer fires 14s after did-finish-load and shows the
 * recovery shell — a false positive in non-Electron contexts, but harmless
 * because sendAppBooted is a silent no-op outside Electron.
 */
export function ElectronBootHeartbeat(): null {
  useEffect(() => {
    sendAppBooted();
  }, []);

  return null;
}