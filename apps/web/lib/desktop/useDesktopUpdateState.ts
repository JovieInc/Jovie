'use client';

import { useCallback, useEffect, useReducer } from 'react';
import {
  DESKTOP_UPDATE_CONTROL_HIDDEN,
  type DesktopUpdateControlState,
  desktopUpdateControlTimeoutMs,
  reduceDesktopUpdateControl,
} from './desktop-update-control-state';
import {
  getDesktopUpdatesBridge,
  isDesktopUpdatePhase,
} from './desktop-updates';

export interface DesktopUpdateControlSnapshot {
  readonly state: DesktopUpdateControlState;
  /** Start the download when the updater is still waiting to be told. */
  readonly download: () => void;
  /** Quit and install the staged build. */
  readonly restart: () => void;
  /** Re-run whatever failed: the check, or the restart. */
  readonly retry: () => void;
}

function isOnline(): boolean {
  return globalThis.navigator?.onLine !== false;
}

function rejectionReason(result: unknown): string | undefined | null {
  if (typeof result !== 'object' || result === null) return null;
  const { ok, reason } = result as { ok?: unknown; reason?: unknown };
  if (ok !== false) return null;
  return typeof reason === 'string' ? reason : undefined;
}

/**
 * Maps the desktop updater IPC (`window.jovieDesktop.updates`) to the
 * DesktopUpdateControl state machine. Reports `hidden` in web builds, on
 * binaries that predate the bridge.
 */
export function useDesktopUpdateState(): DesktopUpdateControlSnapshot {
  const [state, dispatch] = useReducer(
    reduceDesktopUpdateControl,
    DESKTOP_UPDATE_CONTROL_HIDDEN
  );
  const kind = state.kind;
  /** What Retry re-runs from here, if anything. */
  const retryTarget =
    state.kind === 'failed'
      ? state.retry
      : state.kind === 'offline'
        ? 'check'
        : null;

  const runCheck = useCallback(() => {
    const bridge = getDesktopUpdatesBridge();
    if (!bridge) {
      dispatch({ type: 'check-rejected', reason: 'unsupported' });
      return;
    }
    void bridge
      .check()
      .then(result => {
        const reason = rejectionReason(result);
        if (reason !== null) dispatch({ type: 'check-rejected', reason });
      })
      .catch(() => dispatch({ type: 'check-rejected' }));
  }, []);

  const runInstall = useCallback(() => {
    const bridge = getDesktopUpdatesBridge();
    if (!bridge) {
      dispatch({ type: 'restart-rejected' });
      return;
    }
    void bridge
      .install()
      .then(result => {
        const reason = rejectionReason(result);
        if (reason !== null) dispatch({ type: 'restart-rejected', reason });
      })
      .catch(() => dispatch({ type: 'restart-rejected' }));
  }, []);

  // Mirror the main-process phase. A pushed phase that lands before the
  // first snapshot resolves is newer, so the snapshot is then dropped.
  useEffect(() => {
    const bridge = getDesktopUpdatesBridge();
    if (!bridge) return;

    let settled = false;
    const receive = (value: unknown) => {
      if (!isDesktopUpdatePhase(value)) return;
      settled = true;
      dispatch({ type: 'phase', phase: value, online: isOnline() });
    };
    void bridge
      .getState()
      .then(value => {
        if (!settled) receive(value);
      })
      .catch(() => undefined);
    const unsubscribe = bridge.onState(receive);

    return () => {
      settled = true;
      unsubscribe?.();
      dispatch({
        type: 'phase',
        phase: { state: 'unsupported' },
        online: true,
      });
    };
  }, []);

  // Leaving offline is the one transition the machine starts by itself.
  useEffect(() => {
    const onOnline = () => {
      dispatch({ type: 'connectivity', online: true });
      if (kind === 'offline') runCheck();
    };
    const onOffline = () => dispatch({ type: 'connectivity', online: false });
    globalThis.addEventListener('online', onOnline);
    globalThis.addEventListener('offline', onOffline);
    return () => {
      globalThis.removeEventListener('online', onOnline);
      globalThis.removeEventListener('offline', onOffline);
    };
  }, [kind, runCheck]);

  // A check or restart the main process never answers must not spin forever.
  const timeoutMs = desktopUpdateControlTimeoutMs(state.kind);
  useEffect(() => {
    if (timeoutMs === null) return;
    const timer = setTimeout(() => dispatch({ type: 'timed-out' }), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  const download = useCallback(() => {
    if (kind !== 'available') return;
    void getDesktopUpdatesBridge()
      ?.download()
      .catch(() => undefined);
  }, [kind]);

  const restart = useCallback(() => {
    if (kind !== 'ready') return;
    dispatch({ type: 'restart-requested' });
    runInstall();
  }, [kind, runInstall]);

  const retry = useCallback(() => {
    if (retryTarget === null) return;
    dispatch({ type: 'retry-requested' });
    if (retryTarget === 'restart') runInstall();
    else runCheck();
  }, [retryTarget, runCheck, runInstall]);

  return { state, download, restart, retry };
}
