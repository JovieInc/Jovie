'use client';

import { Button } from '@jovie/ui';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function buildHudFullscreenHref(
  currentHref: string,
  fullscreen: boolean
): string {
  const next = new URL(currentHref);
  if (fullscreen) {
    next.searchParams.set('fs', '1');
  } else {
    next.searchParams.delete('fs');
  }
  return `${next.pathname}${next.search}${next.hash}`;
}

export function HudFullscreenControl({
  fullscreen = false,
}: Readonly<{ readonly fullscreen?: boolean }>) {
  const router = useRouter();
  const toggleFullscreen = useCallback(() => {
    router.replace(buildHudFullscreenHref(window.location.href, !fullscreen), {
      scroll: false,
    });
  }, [fullscreen, router]);

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      onClick={toggleFullscreen}
      data-testid='hud-fullscreen-control'
    >
      {fullscreen ? (
        <Minimize2 className='h-3.5 w-3.5' aria-hidden='true' />
      ) : (
        <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
      )}
      {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    </Button>
  );
}
