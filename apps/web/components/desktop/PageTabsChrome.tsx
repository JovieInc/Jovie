'use client';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopPageTabsView } from '@/components/organisms/DesktopPageTabsView';
import type {
  DesktopPageTabsState,
  ElectronAPI,
} from '@/lib/desktop/electron-bridge';

function PageTabsChrome() {
  const [state, setState] = useState<DesktopPageTabsState | null>(null);
  // This bundled local entry shares its exact binary's sandboxed preload.
  // The hosted bridge imports Next/Sentry server modules that cannot run here.
  /* eslint-disable @jovie/no-direct-electron-bridge -- Binary-owned local entry; every method below remains optional. */
  const api = (
    globalThis as typeof globalThis & { electronAPI?: Partial<ElectronAPI> }
  ).electronAPI;
  /* eslint-enable @jovie/no-direct-electron-bridge */
  useEffect(() => {
    let live = true;
    let received = false;
    const stop = api?.onPageTabsChanged?.(value => {
      if (!live) return;
      received = true;
      setState(value);
    });
    void api
      ?.getPageTabs?.()
      .then(value => {
        if (live && !received) setState(value);
      })
      .catch(() => undefined);
    let receivedAppearance = false;
    const applyAppearance = ({ dark, ov }: { dark: boolean; ov: boolean }) => {
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('ov-mode', ov);
    };
    const stopAppearance = api?.onPageTabsAppearance?.(value => {
      if (!live) return;
      receivedAppearance = true;
      applyAppearance(value);
    });
    void api
      ?.getPageTabsAppearance?.()
      .then(value => {
        if (live && !receivedAppearance && value) applyAppearance(value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stop?.();
      stopAppearance?.();
    };
  }, [api]);
  return (
    <DesktopPageTabsView
      state={state}
      command={async command =>
        (await api?.pageTabsCommand?.(command)) ?? false
      }
    />
  );
}

const mount = document.getElementById('page-tabs');
if (!mount) throw new Error('Page tabs mount is missing');
export const pageTabsRoot = createRoot(mount);
pageTabsRoot.render(<PageTabsChrome />);
