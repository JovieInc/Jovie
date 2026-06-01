'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import {
  isElectronRuntime,
  openDesktopAuthUrl,
} from '@/lib/desktop/electron-bridge';

type BrowserOpenState = 'idle' | 'opening' | 'opened' | 'error';

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

function formatOpenError(reason?: string): string {
  if (reason === 'blocked-url' || reason === 'invalid-auth-url') {
    return 'Sign-in could not start. Close this window and try again from Jovie.';
  }

  return 'The browser did not open. Try again from this window.';
}

export function DesktopAuthRouteHandoff() {
  const [openState, setOpenState] = useState<BrowserOpenState>('idle');
  const [openError, setOpenError] = useState<string | null>(null);

  const openAuthUrl = useCallback(async () => {
    if (openState === 'opening') return;

    setOpenState('opening');
    setOpenError(null);
    const result = await openDesktopAuthUrl(globalThis.location.href);
    if (result.ok) {
      setOpenState('opened');
      return;
    }

    setOpenState('error');
    setOpenError(formatOpenError(result.reason));
  }, [openState]);

  const isWaitingInBrowser = openState === 'opened';
  const statusText =
    openState === 'opening'
      ? 'Opening browser...'
      : isWaitingInBrowser
        ? 'Continue signing in with your browser.'
        : openError;

  return (
    <main
      className='relative isolate grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'
      data-desktop-auth-state={openState}
      data-testid='desktop-auth-route-handoff'
    >
      <section className='relative z-10 flex w-full max-w-[320px] flex-col items-center px-4 py-7 text-center'>
        <BrandLogo aria-hidden size={44} tone='white' />
        <h1 className='mt-5 text-[17px] font-medium leading-6'>
          {isWaitingInBrowser
            ? 'Continue signing in with your browser'
            : 'Continue in Browser'}
        </h1>
        {isWaitingInBrowser ? null : (
          <button
            type='button'
            className='mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-55'
            disabled={openState === 'opening'}
            onClick={() => {
              openAuthUrl().catch(() => {});
            }}
          >
            {openState === 'opening'
              ? 'Opening Browser...'
              : 'Continue in Browser'}
          </button>
        )}
        <p
          aria-live='polite'
          role='status'
          className='mt-3 min-h-5 text-[12px] leading-5 text-white/56'
        >
          {statusText}
        </p>
      </section>
    </main>
  );
}
