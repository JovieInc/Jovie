'use client';

import { useCallback, useMemo, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  openDesktopAuthUrl,
} from '@/lib/desktop/electron-bridge';

type BrowserOpenState = 'idle' | 'opening' | 'opened' | 'error';

interface DesktopAuthClientProps {
  readonly authUrlParam: string | null;
}

const BROWSER_OPEN_TIMEOUT_MS = 5000;

function formatOpenError(reason?: string): string {
  if (reason === 'blocked-url' || reason === 'invalid-auth-url') {
    return 'Sign-in could not start. Close this window and try again from Jovie.';
  }

  return 'The browser did not open. Try again, or close this window and start sign-in again.';
}

function formatBrowserOpenStatus(
  openState: BrowserOpenState,
  openError: string | null
): string | null {
  if (openState === 'opened') {
    return 'Check your browser.';
  }

  return openError;
}

async function openWithTimeout(authUrl: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      openDesktopAuthUrl(authUrl),
      new Promise<{ ok: false; reason: string }>(resolve => {
        timeoutId = setTimeout(
          () => resolve({ ok: false, reason: 'desktop-auth-open-timeout' }),
          BROWSER_OPEN_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function getAppOrigin(): string {
  return globalThis.window === undefined
    ? 'https://jov.ie'
    : globalThis.window.location.origin;
}

export function DesktopAuthClient({ authUrlParam }: DesktopAuthClientProps) {
  const [openState, setOpenState] = useState<BrowserOpenState>('idle');
  const [openError, setOpenError] = useState<string | null>(null);
  const appOrigin = getAppOrigin();
  const authUrl = useMemo(
    () => sanitizeDesktopAuthUrl(authUrlParam, appOrigin),
    [authUrlParam, appOrigin]
  );

  const openAuthUrl = useCallback(async () => {
    if (!authUrl || openState === 'opening') return;
    setOpenState('opening');
    setOpenError(null);
    try {
      const result = await openWithTimeout(authUrl);
      if (result.ok) {
        setOpenState('opened');
        return;
      }
      setOpenState('error');
      setOpenError(formatOpenError(result.reason));
    } catch {
      setOpenState('error');
      setOpenError(formatOpenError());
    }
  }, [authUrl, openState]);

  const statusText = formatBrowserOpenStatus(openState, openError);
  const isWaitingInBrowser = openState === 'opened';

  return (
    <main
      className='relative isolate grid min-h-dvh place-items-center bg-base px-6 text-primary-token [color-scheme:dark]'
      data-desktop-auth-state={openState}
      data-testid='desktop-auth-handoff'
    >
      <section className='relative z-10 flex w-full max-w-90 flex-col items-center px-6 py-16 text-center'>
        <BrandLogo aria-hidden size={60} tone='white' />
        <h1 className='sr-only'>Sign In To Jovie</h1>
        <div className='mt-8 flex min-h-11 w-full flex-col items-center justify-center gap-2'>
          {isWaitingInBrowser ? null : (
            <button
              type='button'
              className='inline-flex h-11 w-full items-center justify-center rounded-full bg-white px-4 text-app font-medium text-(--color-bg-base) transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white'
              disabled={!authUrl || openState === 'opening'}
              onClick={openAuthUrl}
            >
              {openState === 'opening'
                ? 'Opening Browser...'
                : 'Continue in Browser'}
            </button>
          )}
          {isWaitingInBrowser || !authUrl ? (
            <button
              type='button'
              className='inline-flex h-11 w-full items-center justify-center rounded-full border border-white/10 px-4 text-app font-medium text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25'
              onClick={() => {
                closeDesktopAuthWindow().catch(() => {});
              }}
            >
              Cancel Sign-In
            </button>
          ) : null}
        </div>
        <p
          aria-live='polite'
          role='status'
          className='mt-3 min-h-5 text-xs leading-5 text-white/56'
        >
          {authUrl ? statusText : 'Start sign-in again from Jovie.'}
        </p>
      </section>
    </main>
  );
}
