'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  buildAuthRouteUrlWithMobileReturn,
  sanitizeMobileReturnRoute,
} from '@/lib/mobile/auth-return';

type TicketState =
  | { status: 'loading' }
  | { status: 'ready'; deepLink: string }
  | { status: 'unauthorized'; signInUrl: string }
  | { status: 'error'; signInUrl: string };

function MobileAuthReturnContent() {
  const searchParams = useSearchParams();
  const returnRoute = useMemo(
    () => sanitizeMobileReturnRoute(searchParams.get('route')) ?? '/app',
    [searchParams]
  );
  const signInUrl = useMemo(
    () =>
      buildAuthRouteUrlWithMobileReturn(
        '/signin',
        new URLSearchParams({ mobile_return: returnRoute })
      ),
    [returnRoute]
  );
  const [ticketState, setTicketState] = useState<TicketState>({
    status: 'loading',
  });

  useEffect(() => {
    let isActive = true;

    async function createTicket() {
      try {
        const response = await fetch('/api/mobile/v1/auth/ticket', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ route: returnRoute }),
        });

        if (!isActive) return;

        if (response.status === 401) {
          setTicketState({ status: 'unauthorized', signInUrl });
          return;
        }

        if (!response.ok) {
          setTicketState({ status: 'error', signInUrl });
          return;
        }

        const payload = (await response.json()) as { deepLink?: unknown };
        if (typeof payload.deepLink !== 'string') {
          setTicketState({ status: 'error', signInUrl });
          return;
        }

        setTicketState({ status: 'ready', deepLink: payload.deepLink });
        window.location.href = payload.deepLink;
      } catch {
        if (isActive) {
          setTicketState({ status: 'error', signInUrl });
        }
      }
    }

    void createTicket();

    return () => {
      isActive = false;
    };
  }, [returnRoute, signInUrl]);

  const deepLink = ticketState.status === 'ready' ? ticketState.deepLink : null;
  const signInLink =
    ticketState.status === 'unauthorized' || ticketState.status === 'error'
      ? ticketState.signInUrl
      : null;

  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <p className='text-[13px] leading-5 text-white/60'>Jovie</p>
        <h1 className='mt-2 text-[22px] font-semibold leading-7'>
          Return to the app
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          {signInLink
            ? 'Open sign in again to continue.'
            : 'Authentication is complete. Continue in the Jovie app.'}
        </p>
        {deepLink ? (
          <Link
            href={deepLink}
            className='mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
          >
            Open Jovie
          </Link>
        ) : null}
        {signInLink ? (
          <Link
            href={signInLink}
            className='mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35'
          >
            Sign in
          </Link>
        ) : null}
      </section>
    </main>
  );
}

export default function MobileAuthReturnPage() {
  return (
    <Suspense fallback={null}>
      <MobileAuthReturnContent />
    </Suspense>
  );
}
