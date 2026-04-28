'use client';

import { createContext, useContext } from 'react';

export type PendingShellRoute = 'releases' | null;

export interface PendingShellContextValue {
  readonly clearPendingShell: (route?: PendingShellRoute) => void;
  readonly pendingShellRoute: PendingShellRoute;
  readonly showPendingShell: (route: Exclude<PendingShellRoute, null>) => void;
}

export const noopPendingShellContext: PendingShellContextValue = {
  clearPendingShell: () => {},
  pendingShellRoute: null,
  showPendingShell: () => {},
};

export const PendingShellContext = createContext<PendingShellContextValue>(
  noopPendingShellContext
);

export function usePendingShell() {
  return useContext(PendingShellContext);
}
