'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DesktopAuthHandoffActions,
  type DesktopAuthOpenState,
} from '@/app/desktop-auth/DesktopAuthClient';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { AUTH_SHELL_KIND } from '@/lib/auth/auth-shell-layout-contract';
import { BRAND_MARK_SIZE } from '@/lib/brand/tokens';
import { isElectronRuntime } from '@/lib/desktop/electron-bridge';

interface SearchParamReader {
  get(key: string): string | null;
}

function hasElectronRuntimeHint(searchParams: SearchParamReader): boolean {
  const redirectUrl = searchParams.get('redirect_url') ?? '';
  return (
    searchParams.get('runtime') === 'electron' ||
    redirectUrl.includes('runtime=electron')
  );
}

export function useShouldRenderDesktopAuthHandoff(
  searchParams: SearchParamReader
): boolean {
  const hasRuntimeHint = useMemo(
    () => hasElectronRuntimeHint(searchParams),
    [searchParams]
  );
  const [isElectron, setIsElectron] = useState(hasRuntimeHint);

  useEffect(() => {
    if (isElectronRuntime()) {
      setIsElectron(true);
    }
  }, []);

  return isElectron || hasRuntimeHint;
}

export function DesktopAuthRouteHandoff() {
  const [openState, setOpenState] = useState<DesktopAuthOpenState>('idle');
  const resolveAuthUrl = useCallback(
    () => globalThis.location?.href ?? null,
    []
  );

  return (
    <main
      className='relative isolate grid min-h-dvh place-items-center bg-background px-6 text-white dark:text-white [color-scheme:dark]'
      data-desktop-auth-state={openState}
      data-auth-shell-kind={AUTH_SHELL_KIND.desktopReturnHandoff}
      data-testid='desktop-auth-route-handoff'
    >
      <section className='relative z-10 flex w-full max-w-90 flex-col items-center px-6 py-16 text-center'>
        <BrandLogo aria-hidden size={BRAND_MARK_SIZE.splash} tone='white' />
        <h1 className='sr-only'>Sign In To Jovie</h1>
        <DesktopAuthHandoffActions
          onOpenStateChange={setOpenState}
          resolveAuthUrl={resolveAuthUrl}
        />
      </section>
    </main>
  );
}
