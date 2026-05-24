'use client';

import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  isElectronRuntime,
  openDesktopAuthUrl,
} from '@/lib/desktop/electron-bridge';

type BrowserOpenState = 'idle' | 'opening' | 'opened' | 'error';

const BROWSER_OPEN_TIMEOUT_MS = 5000;

function formatOpenError(reason?: string): string {
  if (reason === 'blocked-url' || reason === 'invalid-auth-url') {
    return 'Sign-in could not start. Close this window and try again from Jovie.';
  }

  return 'The browser did not open. Try again, or close this window and start sign-in again.';
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

function DesktopAuthContent() {
  const searchParams = useSearchParams();
  const [openState, setOpenState] = useState<BrowserOpenState>('idle');
  const [openError, setOpenError] = useState<string | null>(null);
  const autoOpenedRef = useRef(false);
  const appOrigin =
    typeof window === 'undefined' ? 'https://jov.ie' : window.location.origin;
  const authUrl = useMemo(
    () => sanitizeDesktopAuthUrl(searchParams.get('auth_url'), appOrigin),
    [searchParams, appOrigin]
  );
  const canAutoOpen = isElectronRuntime();

  const openAuthUrl = useCallback(async () => {
    if (!authUrl || openState === 'opening') return;
    setOpenState('opening');
    setOpenError(null);
    const result = await openWithTimeout(authUrl);
    if (result.ok) {
      setOpenState('opened');
      return;
    }
    setOpenState('error');
    setOpenError(formatOpenError(result.reason));
  }, [authUrl, openState]);

  useEffect(() => {
    if (!canAutoOpen || !authUrl || autoOpenedRef.current) return;
    let isActive = true;
    autoOpenedRef.current = true;
    setOpenState('opening');
    setOpenError(null);
    openWithTimeout(authUrl)
      .then(result => {
        if (!isActive) return;
        if (result.ok) {
          setOpenState('opened');
        } else {
          setOpenState('error');
          setOpenError(formatOpenError(result.reason));
        }
      })
      .catch(() => {});

    return () => {
      isActive = false;
    };
  }, [authUrl, canAutoOpen]);

  const statusText =
    openState === 'opening'
      ? 'Opening your browser...'
      : openState === 'opened'
        ? 'Continue sign-in in your browser.'
        : openError;

  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <h1 className='text-[22px] font-semibold leading-7'>
          Continue in browser
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          {authUrl
            ? 'Jovie will return here when sign-in is complete.'
            : 'Close this window and start sign-in again from Jovie.'}
        </p>
        <div className='mt-6 flex flex-col gap-2'>
          <button
            type='button'
            className='inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-55'
            disabled={!authUrl || openState === 'opening'}
            onClick={() => {
              openAuthUrl().catch(() => {});
            }}
          >
            Continue in browser
          </button>
          <button
            type='button'
            className='inline-flex h-10 w-full items-center justify-center rounded-full border border-white/10 px-4 text-[13px] font-medium text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25'
            onClick={() => {
              closeDesktopAuthWindow().catch(() => {});
            }}
          >
            Cancel sign-in
          </button>
        </div>
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

export default function DesktopAuthPage() {
  return (
    <Suspense fallback={null}>
      <DesktopAuthContent />
    </Suspense>
  );
}
