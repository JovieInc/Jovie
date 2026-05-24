'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useDesktopUpdate } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';
import { useWebUpdate } from '@/lib/version/use-web-update';

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
      desktop.install();
    } else {
      web.reload();
    }
  }

  return (
    <button
      type='button'
      data-electron-update-pill='true'
      data-electron-no-drag='true'
      data-testid='update-available-pill'
      onClick={handleClick}
      disabled={updating}
      aria-label='Update available — click to install'
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'inline-flex h-6 items-center justify-center gap-1 rounded-full bg-white px-2.5 text-black',
        'hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1 disabled:opacity-70'
      )}
    >
      {updating ? (
        <Loader2 className='h-3 w-3 shrink-0 animate-spin' aria-hidden='true' />
      ) : (
        <Download className='h-3 w-3 shrink-0' aria-hidden='true' />
      )}
      <span className='whitespace-nowrap text-[11.5px] font-medium leading-none'>
        {updating ? 'Updating…' : 'Update'}
      </span>
    </button>
  );
}
