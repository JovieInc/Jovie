'use client';

import { useLayoutEffect, useState } from 'react';
import { reportDesktopWorkState } from './electron-bridge';

/** Mirrors the sandboxed desktop preload's session-work-state contract. */
export interface DesktopWorkState {
  readonly hasDraft: boolean;
  readonly isStreaming: boolean;
  readonly isUploading: boolean;
  readonly hasPendingAction: boolean;
  readonly isAuthenticating: boolean;
}

export const DESKTOP_WORK_HEARTBEAT_MS = 10_000;

const owners = new Map<symbol, DesktopWorkState>();
type DesktopWorkOperation = 'pending-action' | 'authentication';
const operations = new Map<symbol, DesktopWorkOperation>();
const listeners = new Set<() => void>();
let currentWorkState: DesktopWorkState | null = null;

/** Manual native navigation observes the same live work owner as reload safety. */
export function getDesktopWorkState(): DesktopWorkState | null {
  return currentWorkState;
}

export function subscribeDesktopWorkState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Release on operation settlement, never on view or effect cleanup. */
export function beginDesktopWorkOperation(
  kind: DesktopWorkOperation
): () => void {
  const operation = Symbol('desktop-work-operation');
  operations.set(operation, kind);
  publishWorkState();
  return () => {
    if (operations.delete(operation)) publishWorkState();
  };
}

function publishWorkState(): boolean {
  const states = [...owners.values()];
  const pending = [...operations.values()];
  currentWorkState =
    states.length === 0
      ? null
      : {
          hasDraft: states.some(state => state.hasDraft),
          isStreaming: states.some(state => state.isStreaming),
          isUploading: states.some(state => state.isUploading),
          hasPendingAction:
            pending.includes('pending-action') ||
            states.some(state => state.hasPendingAction),
          isAuthenticating:
            pending.includes('authentication') ||
            states.some(state => state.isAuthenticating),
        };
  const supported = reportDesktopWorkState(currentWorkState);
  for (const listener of listeners) listener();
  return supported;
}

/**
 * Only a mounted work owner may claim idle. Unknown routes and unmounts revoke
 * that claim. A throttled or frozen renderer cannot keep old idle evidence live.
 */
export function useDesktopWorkState(state: DesktopWorkState): void {
  const [owner] = useState(() => Symbol('desktop-work-owner'));
  const {
    hasDraft,
    isStreaming,
    isUploading,
    hasPendingAction,
    isAuthenticating,
  } = state;
  useLayoutEffect(() => {
    const current = {
      hasDraft,
      isStreaming,
      isUploading,
      hasPendingAction,
      isAuthenticating,
    };
    owners.set(owner, current);
    const supported = publishWorkState();
    const timer = supported
      ? globalThis.setInterval(() => {
          reportDesktopWorkState(currentWorkState);
        }, DESKTOP_WORK_HEARTBEAT_MS)
      : undefined;
    return () => {
      globalThis.clearInterval(timer);
      owners.delete(owner);
      publishWorkState();
    };
  }, [
    owner,
    hasDraft,
    isStreaming,
    isUploading,
    hasPendingAction,
    isAuthenticating,
  ]);
}
