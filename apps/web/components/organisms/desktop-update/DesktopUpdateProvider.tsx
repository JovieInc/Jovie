'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type DesktopUpdateViewState,
  useDesktopUpdate,
} from '@/lib/desktop/desktop-updates';
import { DesktopUpdateModal } from './DesktopUpdateModal';

const DISMISSED_VERSION_KEY = 'jovie:desktop-update:dismissed';

export interface DesktopUpdateContextValue {
  readonly state: DesktopUpdateViewState;
  /** Open the update modal from the Update menu item. */
  readonly openModal: () => void;
}

const DesktopUpdateContext = createContext<DesktopUpdateContextValue | null>(
  null
);

export function useDesktopUpdateContext(): DesktopUpdateContextValue | null {
  return useContext(DesktopUpdateContext);
}

function readDismissedVersion(): string | null {
  try {
    return globalThis.window?.sessionStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string): void {
  try {
    globalThis.window?.sessionStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // Private mode: dismissal is in-memory only, still once per version.
  }
}

/**
 * Owns the desktop update modal and its once-per-version auto-open. Mounts
 * inside RuntimeUpdateProvider; renders nothing when the updates bridge is
 * unsupported (web builds, stale binaries).
 */
export function DesktopUpdateProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const update = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(
    readDismissedVersion
  );

  const state = update.state;
  const availableVersion = state.state === 'available' ? state.version : null;

  // Auto-open once per version. "Later" (and Esc) record the version so the
  // modal does not reopen until a newer version becomes available.
  useEffect(() => {
    if (availableVersion && availableVersion !== dismissedVersion) {
      setOpen(true);
    }
  }, [availableVersion, dismissedVersion]);

  const later = () => {
    setOpen(false);
    if (availableVersion) {
      setDismissedVersion(availableVersion);
      writeDismissedVersion(availableVersion);
    }
  };

  const value = useMemo<DesktopUpdateContextValue>(
    () => ({ state, openModal: () => setOpen(true) }),
    [state]
  );

  return (
    <DesktopUpdateContext.Provider value={value}>
      {children}
      {state.state !== 'unsupported' ? (
        <DesktopUpdateModal
          open={open}
          state={state}
          onDownload={update.download}
          onInstall={update.install}
          onRetry={update.check}
          onLater={later}
        />
      ) : null}
    </DesktopUpdateContext.Provider>
  );
}
