'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// ElectronAPI type — mirrors what preload.ts exposes via contextBridge
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  readonly platform: NodeJS.Platform;
  readonly electronVersion: string;
  /** Register a callback that fires when electron-updater detects a new version. */
  readonly onUpdateAvailable: (cb: () => void) => () => void;
  /** Register a callback that fires when the update download is complete. */
  readonly onUpdateDownloaded: (cb: () => void) => () => void;
  /** Trigger quit-and-install in the main process. */
  readonly installUpdateAndRestart: () => Promise<{
    readonly ok: boolean;
    readonly reason?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Safe accessor — returns undefined when running in a browser context
// ---------------------------------------------------------------------------

export function getElectronAPI(): ElectronAPI | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
}

export function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if (getElectronAPI()) return true;
  return document.documentElement.dataset.desktopRuntime === 'electron';
}

export function useIsElectronRuntime(): boolean {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  return isElectron;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface DesktopUpdateState {
  /** True once electron-updater fires `update-available`. */
  readonly available: boolean;
  /** True once the update download completes (ready to install). */
  readonly downloaded: boolean;
  /** Trigger quit-and-install. No-op outside Electron. */
  readonly install: () => Promise<void>;
}

/**
 * useDesktopUpdate — subscribes to Electron auto-updater IPC events.
 *
 * Returns `available: false` when running in a plain browser context
 * (no Electron), so callers can safely compose with useWebUpdate without
 * any platform guards.
 */
export function useDesktopUpdate(): DesktopUpdateState {
  const [available, setAvailable] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubscribeAvailable = api.onUpdateAvailable(() =>
      setAvailable(true)
    );
    const unsubscribeDownloaded = api.onUpdateDownloaded(() =>
      setDownloaded(true)
    );

    return () => {
      unsubscribeAvailable();
      unsubscribeDownloaded();
    };
  }, []);

  const install = async () => {
    await getElectronAPI()?.installUpdateAndRestart();
  };

  return { available, downloaded, install };
}
