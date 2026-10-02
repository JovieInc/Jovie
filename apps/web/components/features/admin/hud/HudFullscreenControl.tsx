'use client';

import { Button } from '@jovie/ui';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';

export function HudFullscreenControl({
  action = 'enter',
}: {
  readonly action?: 'enter' | 'close';
}) {
  const router = useRouter();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    const mainPlane = document.querySelector<HTMLElement>(
      '[data-app-shell-main-plane="true"]'
    );
    await mainPlane?.requestFullscreen();
  }, []);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  if (action === 'close') {
    return (
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={() => router.replace(APP_ROUTES.HUD)}
      >
        <X className='h-3.5 w-3.5' aria-hidden='true' />
        Close
      </Button>
    );
  }

  const Icon = isFullscreen ? Minimize2 : Maximize2;
  const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen';

  return (
    <Button
      type='button'
      variant='secondary'
      size='icon'
      onClick={() => void toggleFullscreen()}
      aria-label={label}
      title={label}
    >
      <Icon className='h-3.5 w-3.5' aria-hidden='true' />
    </Button>
  );
}
