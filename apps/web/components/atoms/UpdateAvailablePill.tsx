'use client';

import { Download, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useDesktopUpdate } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';
import { useWebUpdate } from '@/lib/version/use-web-update';

export type UpdateAvailablePillState =
  | 'downloading'
  | 'ready-to-restart'
  | 'restarting'
  | 'web-ready'
  | 'web-updating';

interface UpdateAvailablePillViewProps {
  readonly state: UpdateAvailablePillState;
  readonly onClick: () => void;
}

export function UpdateAvailablePillView({
  state,
  onClick,
}: UpdateAvailablePillViewProps) {
  const isBusy = state === 'downloading' || state === 'restarting';
  const isDownloading = state === 'downloading';
  const isDesktopReady = state === 'ready-to-restart';

  const label = {
    downloading: 'Downloading…',
    'ready-to-restart': 'Restart',
    restarting: 'Restarting…',
    'web-ready': 'Update',
    'web-updating': 'Updating…',
  }[state];

  const ariaLabel = {
    downloading: 'Downloading update',
    'ready-to-restart': 'Ready to restart',
    restarting: 'Restarting to update',
    'web-ready': 'Update available',
    'web-updating': 'Updating',
  }[state];

  return (
    <button
      type='button'
      data-electron-update-pill='true'
      data-electron-no-drag='true'
      data-testid='update-available-pill'
      onClick={onClick}
      disabled={isBusy}
      aria-busy={isBusy}
      aria-label={ariaLabel}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className={cn(
        'inline-flex h-6 w-24 items-center justify-center gap-1 rounded-full border px-1.5 text-2xs font-caption tracking-tight',
        'transition-[background-color,border-color,color,opacity] duration-subtle',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 focus-visible:ring-offset-1 focus-visible:ring-offset-(--linear-bg-page)',
        isDownloading
          ? 'border-subtle bg-surface-1 text-secondary-token'
          : 'border-transparent bg-primary-token text-surface-1 hover:opacity-90',
        'disabled:cursor-default disabled:opacity-70'
      )}
    >
      {isBusy ? (
        <Loader2 className='h-3 w-3 shrink-0 animate-spin' aria-hidden='true' />
      ) : isDesktopReady ? (
        <RotateCcw className='h-3 w-3 shrink-0' aria-hidden='true' />
      ) : (
        <Download className='h-3 w-3 shrink-0' aria-hidden='true' />
      )}
      <span className='whitespace-nowrap leading-none'>{label}</span>
    </button>
  );
}

export function UpdateAvailablePill() {
  const desktop = useDesktopUpdate();
  const web = useWebUpdate();
  const [updating, setUpdating] = useState(false);

  const isAvailable = desktop.available || web.available;
  const isDesktopDownloading = desktop.available && !desktop.downloaded;

  if (!isAvailable) return null;

  function handleClick() {
    if (updating || isDesktopDownloading) return;
    setUpdating(true);

    if (desktop.available) {
      desktop.install();
    } else {
      web.reload();
    }
  }

  const state: UpdateAvailablePillState = (() => {
    if (updating) {
      return desktop.available ? 'restarting' : 'web-updating';
    }
    if (isDesktopDownloading) return 'downloading';
    if (desktop.downloaded) return 'ready-to-restart';
    return 'web-ready';
  })();

  return <UpdateAvailablePillView state={state} onClick={handleClick} />;
}
