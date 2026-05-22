'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeDesktopAuthUrl } from '@/lib/desktop/auth-return';
import {
  closeDesktopAuthWindow,
  isElectronRuntime,
  openDesktopAuthUrl,
} from '@/lib/desktop/electron-bridge';

function DesktopAuthContent() {
  const searchParams = useSearchParams();
  const [isOpening, setIsOpening] = useState(false);
  const autoOpenedRef = useRef(false);
  const appOrigin =
    typeof window === 'undefined' ? 'https://jov.ie' : window.location.origin;
  const authUrl = useMemo(
    () => sanitizeDesktopAuthUrl(searchParams.get('auth_url'), appOrigin),
    [searchParams, appOrigin]
  );
  const canAutoOpen = isElectronRuntime();

  useEffect(() => {
    if (!canAutoOpen || !authUrl || autoOpenedRef.current) return;

    let isActive = true;
    autoOpenedRef.current = true;
    setIsOpening(true);
    void openDesktopAuthUrl(authUrl).finally(() => {
      if (isActive) {
        setIsOpening(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [authUrl, canAutoOpen]);

  const handleContinue = () => {
    if (!authUrl) return;
    setIsOpening(true);
    void openDesktopAuthUrl(authUrl).finally(() => setIsOpening(false));
  };

  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-7 text-center shadow-2xl shadow-black/30'>
        <p className='text-[13px] leading-5 text-white/60'>Jovie Desktop</p>
        <h1 className='mt-2 text-[22px] font-semibold leading-7'>
          Continue in your browser
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          {authUrl
            ? 'For security, Jovie opens sign in with your system browser and returns you here when authentication is complete.'
            : 'We could not prepare a secure browser sign-in link. Close this window and start sign in again from Jovie.'}
        </p>
        <div className='mt-6 flex flex-col gap-2'>
          <button
            type='button'
            className='inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-not-allowed disabled:opacity-55'
            disabled={!authUrl || isOpening}
            onClick={handleContinue}
          >
            {isOpening ? 'Opening...' : 'Open browser again'}
          </button>
          <button
            type='button'
            className='inline-flex h-10 w-full items-center justify-center rounded-full border border-white/10 px-4 text-[13px] font-medium text-white/72 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25'
            onClick={() => {
              void closeDesktopAuthWindow();
            }}
          >
            Cancel sign-in
          </button>
        </div>
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
