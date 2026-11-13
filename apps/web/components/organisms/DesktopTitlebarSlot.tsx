'use client';

import dynamic from 'next/dynamic';
import {
  isElectronRuntime,
  useIsElectronRuntime,
} from '@/lib/desktop/electron-runtime';

// Fetch the existing chunk in parallel with hydration only in Electron.
if (isElectronRuntime()) {
  void import('@/components/organisms/DesktopTitlebar').catch(() => undefined);
}

// Loaded only inside the Electron runtime: the titlebar's subtree (update
// modal, keyboard shortcuts, radix dialog, desktop build identity) is
// desktop-only and stayed out of the browser shell's initial chunks.
const DesktopTitlebar = dynamic(
  () =>
    import('@/components/organisms/DesktopTitlebar').then(
      m => m.DesktopTitlebar
    ),
  { ssr: false }
);

/** Slot for the desktop window-control row; renders nothing in the browser. */
export function DesktopTitlebarSlot() {
  if (!useIsElectronRuntime()) return null;
  return <DesktopTitlebar />;
}
