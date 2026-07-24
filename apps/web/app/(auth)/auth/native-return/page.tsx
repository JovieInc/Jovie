'use client';

import {
  buildElectronAuthCompleteUrl,
  type ElectronAuthCompleteProtocol,
  getElectronAuthCompleteProtocolForOrigin,
} from '@jovie/auth-routing';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

// Bounce page for the desktop (Electron) auth return.
//
// The Electron sign-in flow runs in the user's real system browser
// (shell.openExternal), not inside an ASWebAuthenticationSession. A raw
// server 302 to `jovie://auth/complete` is NOT reliably handed off to the app
// by modern browsers without a user gesture, so users would sign in on the web
// and never bounce back to the Mac app. This page fires the deep link
// automatically AND exposes an "Open Jovie" button (guaranteed user gesture),
// mirroring the proven legacy `/auth-return` page.

const DESKTOP_FLOW_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function sanitizeExchangeCode(value: string | null): string | null {
  return value && /^[a-f0-9]{16,64}$/i.test(value) ? value : null;
}

function NativeReturnContent() {
  const searchParams = useSearchParams();
  const [protocol, setProtocol] = useState<ElectronAuthCompleteProtocol | null>(
    null
  );

  useEffect(() => {
    if (!globalThis.location) return;
    setProtocol(
      getElectronAuthCompleteProtocolForOrigin(globalThis.location.origin)
    );
  }, []);

  const nativeReturnParams = useMemo(() => {
    const code = sanitizeExchangeCode(searchParams.get('code'));
    const state = sanitizeExchangeCode(searchParams.get('state'));
    if (!code || !state) return null;

    const rawDesktopFlow = searchParams.get('desktop_flow');
    const desktopFlow =
      rawDesktopFlow && DESKTOP_FLOW_PATTERN.test(rawDesktopFlow)
        ? rawDesktopFlow
        : null;

    return { code, state, desktopFlow };
  }, [searchParams]);

  const deepLink = useMemo(() => {
    if (!nativeReturnParams || !protocol) return null;

    return buildElectronAuthCompleteUrl({
      ...nativeReturnParams,
      protocol,
    });
  }, [nativeReturnParams, protocol]);

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
          {deepLink || nativeReturnParams
            ? 'Authentication is complete. Continue in the Jovie desktop app.'
            : 'This sign-in link is missing required information. Start sign-in again from Jovie.'}
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

export default function NativeReturnPage() {
  return (
    <Suspense fallback={null}>
      <NativeReturnContent />
    </Suspense>
  );
}
