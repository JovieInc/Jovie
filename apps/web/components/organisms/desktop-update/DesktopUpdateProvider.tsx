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
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { DesktopUpdateModal } from './DesktopUpdateModal';

const DISMISSED_VERSION_KEY = 'jovie:desktop-update:dismissed';

export interface DesktopUpdateContextValue {
  readonly state: DesktopUpdateViewState;
  /** Open the update modal from the Update menu item. */
  readonly openModal: () => void;
  readonly installing: boolean;
  readonly deferred: boolean;
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
 * Owns the desktop update modal and its once-per-version auto-open; renders
 * nothing when the updates bridge is unsupported (web builds, stale binaries).
 */
export function DesktopUpdateProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const update = useDesktopUpdate();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(false);
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
    () => ({ state, installing, deferred, openModal: () => setOpen(true) }),
    [state, installing, deferred]
  );

  const install = () => {
    if (installing) return;
    const work = getDesktopWorkState();
    if (work && Object.values(work).some(Boolean)) {
      setDeferred(true);
      setInstallNotice(
        'Save your draft and finish active work, then try Restart again.'
      );
      return;
    }
    setDeferred(false);
    setInstallNotice(null);
    setInstalling(true);
    void update
      .install()
      .then(result => {
        if (
          result === false ||
          (typeof result === 'object' &&
            result !== null &&
            'ok' in result &&
            result.ok === false)
        ) {
          setInstalling(false);
          setInstallNotice('The update could not start. Try Restart again.');
        }
      })
      .catch(() => {
        setInstalling(false);
        setInstallNotice('The update could not start. Try Restart again.');
      });
  };

  return (
    <DesktopUpdateContext.Provider value={value}>
      {children}
      {state.state !== 'unsupported' ? (
        <DesktopUpdateModal
          open={open}
          state={state}
          onDownload={update.download}
          onInstall={install}
          installing={installing}
          installNotice={installNotice}
          onRetry={update.check}
          onLater={later}
        />
      ) : null}
    </DesktopUpdateContext.Provider>
  );
}
