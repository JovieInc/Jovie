'use client';

import { Button } from '@jovie/ui';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { resolveHudEscapeContract } from '@/lib/app-shell/escape-contract';

export function HudFullscreenControl({
  action = 'enter',
}: {
  readonly action?: 'enter' | 'exit' | 'close';
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

  const returnToShell = useCallback(() => {
    const backTarget =
      resolveHudEscapeContract(
        action === 'close' ? 'packaged-mac-hud' : 'isolated-fullscreen'
      ).backTarget ?? APP_ROUTES.HUD;
    window.location.assign(backTarget);
  }, [action]);

  useEffect(() => {
    if (action !== 'exit' && action !== 'close') return;
    const keyboard = resolveHudEscapeContract(
      action === 'close' ? 'packaged-mac-hud' : 'isolated-fullscreen'
    ).keyboard;
    if (!keyboard.includes('Escape')) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      returnToShell();
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [action, returnToShell]);

  if (action === 'exit' || action === 'close') {
    const label = action === 'close' ? 'Close' : 'Exit fullscreen';
    const Icon = action === 'close' ? X : Minimize2;
    return (
      <Button
        type='button'
        variant='secondary'
        size='sm'
        onClick={returnToShell}
      >
        <Icon className='h-3.5 w-3.5' aria-hidden='true' />
        {label}
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
