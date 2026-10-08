'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import { DesktopUpdateProvider } from '@/components/organisms/desktop-update/DesktopUpdateProvider';
import {
  useDesktopUpdate,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { env } from '@/lib/env-client';
import { useVersionMonitor } from '@/lib/hooks/useVersionMonitor';
import { getVersionUpdateTitle } from './getVersionUpdateTitle';

interface RuntimeUpdate {
  readonly isDesktop: boolean;
  readonly available: boolean;
  readonly busy: boolean;
  readonly deferred: boolean;
  readonly title: string;
  readonly description: string;
  readonly apply: () => void;
}
const RuntimeUpdateContext = createContext<RuntimeUpdate | null>(null);

/** Keep existing updater events alive across routes; Inbox owns their display. */
export function RuntimeUpdateProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const isDesktop = useIsElectronRuntime();
  const desktop = useDesktopUpdate();
  const web = useVersionMonitor({
    enabled: !isDesktop && !env.IS_TEST && !env.IS_E2E,
  });
  const [applying, setApplying] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const available =
    desktop.available || desktop.downloaded || (!isDesktop && web.hasMismatch);
  const downloading = desktop.available && !desktop.downloaded;
  const busy = applying || downloading;
  const title = deferred
    ? 'Save current work before updating'
    : applying
      ? 'Updating Jovie…'
      : downloading
        ? 'Downloading Jovie Update…'
        : isDesktop
          ? 'Restart Jovie To Update'
          : 'Reload Jovie To Update';
  const description = deferred
    ? 'The update is waiting for your draft, upload or active action to finish. Try again when ready.'
    : applying
      ? 'Installing the update and restarting Jovie…'
      : downloading
        ? 'The update will be ready to install when the download completes.'
        : isDesktop
          ? 'Install the available update when you are ready.'
          : `${getVersionUpdateTitle(web.mismatchInfo?.newVersion)}. Reload when ready.`;
  const apply = () => {
    if (!available || busy) return;
    const work = getDesktopWorkState();
    if (work && Object.values(work).some(Boolean)) {
      setDeferred(true);
      return;
    }
    setDeferred(false);
    setApplying(true);
    if (isDesktop) {
      void desktop
        .install()
        .then(started => {
          if (!started) setApplying(false);
        })
        .catch(() => setApplying(false));
    } else globalThis.location.reload();
  };
  return (
    <RuntimeUpdateContext.Provider
      value={{
        isDesktop,
        available,
        busy,
        deferred,
        title,
        description,
        apply,
      }}
    >
      <DesktopUpdateProvider>{children}</DesktopUpdateProvider>
    </RuntimeUpdateContext.Provider>
  );
}
export function useRuntimeUpdate() {
  return useContext(RuntimeUpdateContext);
}
