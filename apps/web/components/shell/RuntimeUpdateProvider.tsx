'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import {
  useDesktopUpdate,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-bridge';
import { env } from '@/lib/env-client';
import { useVersionMonitor } from '@/lib/hooks/useVersionMonitor';
import { getVersionUpdateTitle } from './getVersionUpdateTitle';

interface RuntimeUpdate {
  readonly available: boolean;
  readonly busy: boolean;
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
  const available =
    desktop.available || desktop.downloaded || (!isDesktop && web.hasMismatch);
  const downloading = desktop.available && !desktop.downloaded;
  const busy = applying || downloading;
  const title = applying
    ? 'Updating Jovie…'
    : downloading
      ? 'Downloading Jovie Update…'
      : isDesktop
        ? 'Restart Jovie To Update'
        : 'Reload Jovie To Update';
  const description = downloading
    ? 'The update will be ready to install when the download completes.'
    : isDesktop
      ? 'Install the available update when you are ready.'
      : `${getVersionUpdateTitle(web.mismatchInfo?.newVersion)}. Reload when ready.`;
  const apply = () => {
    if (!available || busy) return;
    setApplying(true);
    if (isDesktop) desktop.install();
    else globalThis.location.reload();
  };
  return (
    <RuntimeUpdateContext.Provider
      value={{ available, busy, title, description, apply }}
    >
      {children}
    </RuntimeUpdateContext.Provider>
  );
}
export function useRuntimeUpdate() {
  return useContext(RuntimeUpdateContext);
}
