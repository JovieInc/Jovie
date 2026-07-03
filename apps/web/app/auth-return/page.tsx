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
    globalThis.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-primary-token'>
      <section className='w-full max-w-sm rounded-2xl border border-subtle bg-surface-1 px-6 py-7 text-center shadow-card'>
        <p className='text-sm leading-5 text-tertiary-token'>Jovie Desktop</p>
        <h1 className='mt-2 text-xl font-semibold leading-7'>
          Return to the app
        </h1>
        <p className='mt-3 text-sm leading-5 text-secondary-token'>
          Authentication is complete. Continue in the Jovie desktop app.
        </p>
        <Link
          href={deepLink}
          className='focus-ring-transparent-offset mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-btn-primary px-4 text-sm font-medium text-btn-primary-foreground transition-opacity duration-subtle hover:opacity-95'
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
