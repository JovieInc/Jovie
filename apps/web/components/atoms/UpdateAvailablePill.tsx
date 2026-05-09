'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useDesktopUpdate } from '@/lib/desktop/electron-bridge';
import { useWebUpdate } from '@/lib/version/use-web-update';

/**
 * UpdateAvailablePill — Codex titlebar-style update indicator.
 *
 * Renders only when an update is detected from either:
 *   - Electron auto-updater IPC (desktop)
 *   - /api/version build-hash drift (web)
 *
 * Visual spec (locked):
 *   - bg-blue-600 (hover: bg-blue-700, color-change only — no motion)
 *   - text-sm font-semibold text-white
 *   - rounded-full px-3 h-7
 *   - WebkitAppRegion: no-drag (so click works inside Electron titlebar)
 *   - Click: shows "Updating…" spinner, then triggers install/reload
 */
export function UpdateAvailablePill() {
  const desktop = useDesktopUpdate();
  const web = useWebUpdate();
  const [updating, setUpdating] = useState(false);

  const isAvailable = desktop.available || web.available;

  if (!isAvailable) return null;

  function handleClick() {
    if (updating) return;
    setUpdating(true);

    if (desktop.available) {
      void desktop.install();
    } else {
      web.reload();
    }
  }

  return (
    <button
      type='button'
      data-electron-update-pill='true'
      data-electron-no-drag='true'
      onClick={handleClick}
      disabled={updating}
      aria-label='Update available — click to install'
      // WebkitAppRegion no-drag so clicks register inside Electron's frameless titlebar
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className='inline-flex h-7 items-center gap-1.5 rounded-full bg-blue-600 px-3 text-sm font-semibold text-white transition-colors duration-subtle hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-70'
    >
      {updating ? (
        <>
          <Loader2 className='h-3 w-3 animate-spin' aria-hidden='true' />
          <span>Updating…</span>
        </>
      ) : (
        <span>Update</span>
      )}
    </button>
  );
}
