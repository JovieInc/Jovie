'use client';

import {
  buildElectronAuthCompleteUrl,
  buildIosAuthCompleteUrl,
  type ElectronAuthCompleteProtocol,
  getElectronAuthCompleteProtocolForOrigin,
  NATIVE_HANDBACK_BOUNCE_PATHS,
  type NativeAuthClient,
} from '@jovie/auth-routing';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

// Bounce page for native auth return (iOS + Electron).
//
// Native sign-in runs in ASWebAuthenticationSession or the system browser.
// A raw server 302 to a custom scheme is not a reliable handback, so this
// same-origin page fires the allowlisted deep link and keeps a "Return to
// Jovie" button. It never continues into the web dashboard/profile/library.

const DESKTOP_FLOW_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function sanitizeExchangeCode(value: string | null): string | null {
  return value && /^[a-f0-9]{16,64}$/i.test(value) ? value : null;
}

function resolveNativeReturnClient(
  pathname: string | null,
  queryClient: string | null
): NativeAuthClient | null {
  if (queryClient === 'ios' || pathname === NATIVE_HANDBACK_BOUNCE_PATHS.ios) {
    return 'ios';
  }
  if (
    queryClient === 'electron' ||
    queryClient === null ||
    pathname === NATIVE_HANDBACK_BOUNCE_PATHS.electron
  ) {
    return queryClient === 'web' ? null : 'electron';
  }
  return null;
}

function NativeReturnContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [protocol, setProtocol] = useState<ElectronAuthCompleteProtocol | null>(
    null
  );
  const client = resolveNativeReturnClient(
    pathname,
    searchParams.get('client')
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
    if (!nativeReturnParams || !client) return null;
    if (client === 'ios') {
      return buildIosAuthCompleteUrl(nativeReturnParams);
    }
    if (!protocol) return null;

    return buildElectronAuthCompleteUrl({
      ...nativeReturnParams,
      protocol,
    });
  }, [client, nativeReturnParams, protocol]);

  useEffect(() => {
    if (deepLink && globalThis.location) {
      globalThis.location.href = deepLink;
    }
  }, [deepLink]);

  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-primary-token'>
      <section className='w-full max-w-sm rounded-2xl border border-subtle bg-surface-1 px-6 py-7 text-center shadow-card'>
        {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- Approved conversational return phrase. */}
        <h1 className='text-xl font-semibold leading-7'>Return to Jovie</h1>
        <p className='mt-3 text-sm leading-5 text-secondary-token'>
          {deepLink || nativeReturnParams
            ? 'Authentication is complete. Return to Jovie.'
            : 'This sign-in link is missing required information. Start sign-in again from Jovie.'}
        </p>
        {deepLink ? (
          <Link
            href={deepLink}
            className='focus-ring-transparent-offset mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-btn-primary px-4 text-sm font-medium text-btn-primary-foreground transition-opacity duration-subtle hover:opacity-95'
          >
            Return to Jovie
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
