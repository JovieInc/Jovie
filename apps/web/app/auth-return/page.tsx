'use client';

import type { ElectronAuthCompleteProtocol } from '@jovie/auth-routing';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  buildDesktopAuthDeepLink,
  getDesktopAuthReturnProtocolForOrigin,
  sanitizeDesktopReturnRoute,
} from '@/lib/desktop/auth-return';

function AuthReturnContent() {
  const searchParams = useSearchParams();
  const [protocol, setProtocol] = useState<ElectronAuthCompleteProtocol | null>(
    null
  );

  useEffect(() => {
    if (!globalThis.location) return;
    setProtocol(
      getDesktopAuthReturnProtocolForOrigin(globalThis.location.origin)
    );
  }, []);

  const returnRoute = useMemo(
    () => sanitizeDesktopReturnRoute(searchParams.get('route')) ?? '/app',
    [searchParams]
  );
  const deepLink = useMemo(() => {
    if (!protocol) return null;
    return buildDesktopAuthDeepLink(returnRoute, protocol);
  }, [returnRoute, protocol]);

  useEffect(() => {
    if (deepLink && globalThis.location) {
      globalThis.location.href = deepLink;
    }
  }, [deepLink]);

  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-primary-token'>
      <section className='w-full max-w-sm rounded-2xl border border-subtle bg-surface-1 px-6 py-7 text-center shadow-card'>
        <p className='text-sm leading-5 text-tertiary-token'>Jovie Desktop</p>
        <h1 className='mt-2 text-xl font-semibold leading-7'>
          Return To The App
        </h1>
        <p className='mt-3 text-sm leading-5 text-secondary-token'>
          Authentication is complete. Continue in the Jovie desktop app.
        </p>
        {deepLink ? (
          <Link
            href={deepLink}
            className='focus-ring-transparent-offset mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-btn-primary px-4 text-sm font-medium text-btn-primary-foreground transition-opacity duration-subtle hover:opacity-95'
          >
            Open Jovie
          </Link>
        ) : null}
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
