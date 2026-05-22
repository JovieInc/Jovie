'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import {
  buildDesktopAuthDeepLink,
  sanitizeDesktopReturnRoute,
} from '@/lib/desktop/auth-return';

function AuthReturnContent() {
  const searchParams = useSearchParams();
  const returnRoute = useMemo(
    () => sanitizeDesktopReturnRoute(searchParams.get('route')) ?? '/app',
    [searchParams]
  );
  const deepLink = useMemo(
    () => buildDesktopAuthDeepLink(returnRoute),
    [returnRoute]
  );

  useEffect(() => {
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.045] px-6 py-7 text-center shadow-2xl shadow-black/30'>
        <p className='text-[13px] leading-5 text-white/60'>Jovie Desktop</p>
        <h1 className='mt-2 text-[22px] font-semibold leading-7'>
          Return to the app
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          Authentication is complete. Continue in the Jovie desktop app.
        </p>
        <Link
          href={deepLink}
          className='mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
        >
          Open Jovie
        </Link>
      </section>
    </main>
  );
}

export default function AuthReturnPage() {
  return (
    <Suspense fallback={null}>
      <AuthReturnContent />
    </Suspense>
  );
}
