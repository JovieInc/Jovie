/**
 * Shared jsdom helpers for desktop-updates tests: installs a fake
 * `window.jovieDesktop.updates` bridge and returns an emitter.
 */
import { vi } from 'vitest';
import type {
  DesktopUpdatePhase,
  JovieDesktopUpdatesBridge,
} from './desktop-updates';

export type DesktopUpdateStateListener = (phase: unknown) => void;

export function installDesktopUpdateBridge(
  initial: DesktopUpdatePhase | null = null
) {
  const listeners = new Set<DesktopUpdateStateListener>();
  const bridge: JovieDesktopUpdatesBridge = {
    getState: vi.fn(async () => initial),
    check: vi.fn(async () => ({ ok: true })),
    download: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true })),
    onState: vi.fn((cb: DesktopUpdateStateListener) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
  };
  Object.defineProperty(window, 'jovieDesktop', {
    configurable: true,
    writable: true,
    value: { updates: bridge },
  });
  return {
    bridge,
    emit(phase: DesktopUpdatePhase) {
      for (const cb of listeners) cb(phase);
    },
  };
}

export function uninstallDesktopUpdateBridge() {
  Reflect.deleteProperty(window, 'jovieDesktop');
}

export function availableUpdate(
  version: string
): Extract<DesktopUpdatePhase, { state: 'available' }> {
  return {
    state: 'available',
    version,
    releaseDate: '2026-09-27T00:00:00.000Z',
    notesUrl: 'https://jov.ie/changelog',
  };
}

export function downloadingUpdate(
  percent: number
): Extract<DesktopUpdatePhase, { state: 'downloading' }> {
  return {
    state: 'downloading',
    percent,
    transferredBytes: 1,
    totalBytes: 2,
    bytesPerSecond: 1,
  };
}
