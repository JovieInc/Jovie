'use client';

import { useEffect, useState } from 'react';
import type { ElectronAPI } from './electron-bridge';

// Leaf module on purpose: the shell's browser tree imports the runtime
// detection hook from here (via DesktopTitlebarSlot and AuthShell) without
// dragging the full electron-bridge wiring (update modal, keyboard
// shortcuts, radix dialog) into the initial chunks. electron-bridge
// re-exports everything here, so existing importers are unaffected.

function getRawElectronAPI(): Partial<ElectronAPI> | undefined {
  if (globalThis.window === undefined) return undefined;
  const raw = (
    globalThis.window as Window & { electronAPI?: Partial<ElectronAPI> }
  ).electronAPI;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw;
}

export function getElectronAPI(): ElectronAPI | undefined {
  const api = getRawElectronAPI();
  if (!api) return undefined;
  if (
    typeof api.platform === 'string' &&
    typeof api.electronVersion === 'string' &&
    typeof api.onUpdateAvailable === 'function' &&
    typeof api.onUpdateDownloaded === 'function' &&
    typeof api.installUpdateAndRestart === 'function' &&
    typeof api.goBack === 'function' &&
    typeof api.goForward === 'function' &&
    typeof api.onNavStateChanged === 'function'
  ) {
    return api as ElectronAPI;
  }
  return undefined;
}

/** True when an electron preload bridge is present, whatever its version. */
export function isDesktopEnvironment(): boolean {
  return getRawElectronAPI() !== undefined;
}

/**
 * Returns true when running inside the Electron desktop shell (regardless of
 * which bridge methods exist). Use this to gate desktop-only UI; for actual
 * bridge calls always go through the electron-bridge wrappers — never the
 * raw object.
 */
export function isElectronRuntime(): boolean {
  if (globalThis.window === undefined) return false;
  if (isDesktopEnvironment()) return true;
  if (/\bJovieDesktop\//.test(globalThis.navigator.userAgent)) return true;
  return (
    globalThis.document.documentElement.dataset.desktopRuntime === 'electron'
  );
}

export function useIsElectronRuntime(): boolean {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  return isElectron;
}
