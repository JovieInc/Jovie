'use client';

import { Button } from '@jovie/ui';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useCallback } from 'react';
import { APP_ROUTES } from '@/constants/routes';

export function HudFullscreenControl({
  action = 'enter',
}: {
  readonly action?: 'enter' | 'exit';
}) {
  const openFullscreen = useCallback(async () => {
    let token: string | null = null;
    try {
      const response = await fetch('/api/hud/kiosk-session', {
        cache: 'no-store',
      });
      if (response.ok) {
        const body = (await response.json()) as { token?: string | null };
        token = body.token?.trim() || null;
      }
    } catch {
      token = null;
    }

    const next = new URL(APP_ROUTES.HUD, window.location.origin);
    next.searchParams.set('fs', '1');
    if (token) next.searchParams.set('kiosk', token);

    window.location.assign(next.toString());
  }, []);

  const exitFullscreen = useCallback(() => {
    window.location.assign(APP_ROUTES.HUD);
  }, []);

  if (action === 'exit') {
    return (
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={exitFullscreen}
      >
        <Minimize2 className='h-3.5 w-3.5' aria-hidden='true' />
        Exit fullscreen
      </Button>
    );
  }

  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      onClick={() => void openFullscreen()}
    >
      <Maximize2 className='h-3.5 w-3.5' aria-hidden='true' />
      Fullscreen
    </Button>
  );
}
