'use client';

import {
  buildDesktopAuthLoopbackUrl,
  buildElectronAuthCompleteUrl,
  buildIosAuthCompleteUrl,
  type ElectronAuthCompleteProtocol,
  getElectronAuthCompleteProtocolForOrigin,
  isValidNativeAttempt,
  NATIVE_HANDBACK_BOUNCE_PATHS,
  type NativeAuthClient,
  parseDesktopLoopbackPortParam,
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
// Matches the server's RFC 8628 style alphabet (consonants, no look-alikes).
const RETURN_CODE_PATTERN = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;

function formatReturnCode(value: string | null): string | null {
  if (!value || !RETURN_CODE_PATTERN.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

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
    const attempts = searchParams.getAll('native_attempt');
    const nativeAttempt = attempts[0];
    if (
      !code ||
      !state ||
      attempts.length > 1 ||
      !isValidNativeAttempt(client, nativeAttempt)
    )
      return null;

    const rawDesktopFlow = searchParams.get('desktop_flow');
    const desktopFlow =
      rawDesktopFlow && DESKTOP_FLOW_PATTERN.test(rawDesktopFlow)
        ? rawDesktopFlow
        : null;

    return { code, state, desktopFlow, nativeAttempt };
  }, [client, searchParams]);

  // Fallback when the deep link cannot reach the app: the user types this
  // into the Mac app, which redeems it with its own PKCE verifier.
  const returnCode =
    client === 'electron' && nativeReturnParams?.desktopFlow
      ? formatReturnCode(searchParams.get('return_code'))
      : null;

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

  // RFC 8252 section 7.3 loopback return: when the pending app advertised a
  // 127.0.0.1 listener at /auth/start, hand it the same code/state pair the
  // deep link carries. A fetch (not a top-level navigation) so sign-in done
  // on another device — where nothing is listening — still shows the return
  // code instead of a browser error page. Same-device by construction.
  const loopbackUrl = useMemo(() => {
    if (client !== 'electron' || !nativeReturnParams) return null;
    const port = parseDesktopLoopbackPortParam(
      searchParams.get('loopback_port')
    );
    if (!port) return null;
    return buildDesktopAuthLoopbackUrl({ ...nativeReturnParams, port });
  }, [client, nativeReturnParams, searchParams]);

  useEffect(() => {
    if (!loopbackUrl || typeof globalThis.fetch !== 'function') return;
    const controller = new AbortController();
    globalThis
      .fetch(loopbackUrl, {
        credentials: 'omit',
        signal: controller.signal,
      })
      .catch(() => {
        // App not listening (finished on another device, or an older app).
        // The deep link and return code still cover the handback.
      });
    return () => controller.abort();
  }, [loopbackUrl]);

  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-primary-token'>
      {deepLink ? (
        <iframe
          aria-hidden='true'
          data-testid='native-protocol-launcher'
          hidden
          src={deepLink}
          title='Jovie app launcher'
        />
      ) : null}
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
        {deepLink && returnCode ? (
          <div
            className='mt-6 border-t border-subtle pt-5'
            data-testid='desktop-return-code'
          >
            <p className='text-xs leading-5 text-secondary-token'>
              Jovie did not open? Enter this code in the app.
            </p>
            <p className='mt-2 select-all font-mono text-lg font-semibold tracking-widest text-primary-token'>
              {returnCode}
            </p>
          </div>
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
