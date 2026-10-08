'use client';

import { useEffect, useState } from 'react';

// window.jovieDesktop.updates contract — mirrors apps/desktop/src/preload.ts.
// Binaries that predate the bridge leave `window.jovieDesktop` undefined; the
// hook then reports 'unsupported' and every update surface renders nothing.

export type DesktopUpdatePhase =
  | { readonly state: 'idle' }
  | { readonly state: 'checking' }
  | { readonly state: 'not-available' }
  | {
      readonly state: 'available';
      readonly version: string;
      readonly releaseDate: string | null;
      readonly notesUrl: string;
    }
  | {
      readonly state: 'downloading';
      readonly percent: number;
      readonly transferredBytes: number;
      readonly totalBytes: number;
      readonly bytesPerSecond: number;
    }
  | { readonly state: 'ready'; readonly version: string }
  | {
      readonly state: 'error';
      readonly message: string;
      readonly retryable: boolean;
    };

export type DesktopUpdateViewState =
  | DesktopUpdatePhase
  | { readonly state: 'unsupported' };

export const DESKTOP_UPDATE_UNSUPPORTED: DesktopUpdateViewState = {
  state: 'unsupported',
};

export interface JovieDesktopUpdatesBridge {
  readonly getState: () => Promise<unknown>;
  readonly check: () => Promise<unknown>;
  readonly download: () => Promise<unknown>;
  readonly install: () => Promise<unknown>;
  readonly onState: (cb: (phase: unknown) => void) => () => void;
}

const DESKTOP_UPDATE_STATES = new Set([
  'idle',
  'checking',
  'not-available',
  'available',
  'downloading',
  'ready',
  'error',
]);

export function isDesktopUpdatePhase(
  value: unknown
): value is DesktopUpdatePhase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'state' in value &&
    DESKTOP_UPDATE_STATES.has((value as { state: unknown }).state as string)
  );
}

interface JovieDesktopWindow {
  readonly jovieDesktop?: {
    readonly updates?: Partial<JovieDesktopUpdatesBridge>;
  };
}

const BRIDGE_METHODS = [
  'getState',
  'check',
  'download',
  'install',
  'onState',
] as const;

export function getDesktopUpdatesBridge():
  | JovieDesktopUpdatesBridge
  | undefined {
  if (globalThis.window === undefined) return undefined;
  const updates = (globalThis.window as JovieDesktopWindow).jovieDesktop
    ?.updates;
  return updates &&
    BRIDGE_METHODS.every(method => typeof updates[method] === 'function')
    ? (updates as JovieDesktopUpdatesBridge)
    : undefined;
}

export interface DesktopUpdateSnapshot {
  readonly state: DesktopUpdateViewState;
  readonly check: () => void;
  readonly download: () => void;
  readonly install: () => Promise<unknown>;
}

const noop = () => undefined;

/**
 * Subscribes to the desktop updater state machine. Returns
 * `{state: 'unsupported'}` in web builds and on stale binaries; callers render
 * nothing in that case.
 */
export function useDesktopUpdate(): DesktopUpdateSnapshot {
  const [phase, setPhase] = useState<DesktopUpdatePhase | null>(null);

  useEffect(() => {
    const bridge = getDesktopUpdatesBridge();
    if (!bridge) return;

    let cancelled = false;
    void bridge
      .getState()
      .then(value => {
        // A pushed phase that arrived before the snapshot resolves is newer.
        if (!cancelled && isDesktopUpdatePhase(value)) {
          setPhase(current => current ?? value);
        }
      })
      .catch(() => undefined);

    const unsubscribe = bridge.onState(value => {
      if (isDesktopUpdatePhase(value)) setPhase(value);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const bridge = getDesktopUpdatesBridge();
  if (!bridge) {
    return {
      state: DESKTOP_UPDATE_UNSUPPORTED,
      check: noop,
      download: noop,
      install: async () => false,
    };
  }

  return {
    state: phase ?? { state: 'idle' },
    check: () => void bridge.check().catch(() => undefined),
    download: () => void bridge.download().catch(() => undefined),
    install: () => bridge.install(),
  };
}
