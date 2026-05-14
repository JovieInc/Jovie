'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useDesktopUpdate } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';
import { useWebUpdate } from '@/lib/version/use-web-update';

interface UpdateAvailablePillProps {
  /**
   * Compact mode — collapses to an icon-only circle.
   * Used in the Electron titlebar when the sidebar is open to conserve space.
   * Transitions smoothly to the full text pill when false.
   */
  readonly compact?: boolean;
}

export function UpdateAvailablePill({
  compact = false,
}: UpdateAvailablePillProps) {
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
        'inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-white text-black',
        'overflow-hidden transition-[max-width,padding,gap] duration-subtle',
        'hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1 disabled:opacity-70',
        compact ? 'max-w-[28px] gap-0 px-0' : 'max-w-[100px] gap-1.5 px-3'
      )}
    >
      {updating ? (
        <Loader2
          className='h-3.5 w-3.5 shrink-0 animate-spin'
          aria-hidden='true'
        />
      ) : (
        <Download className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
      )}
      <span
        className={cn(
          'whitespace-nowrap text-[12px] font-medium',
          'transition-opacity duration-subtle',
          compact ? 'opacity-0' : 'opacity-100'
        )}
      >
        {updating ? 'Updating…' : 'Update'}
      </span>
    </button>
  );
}
