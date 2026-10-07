'use client';

import { Button } from '@jovie/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  consumeDesktopAuthCompletion,
  getDesktopPasskeyState,
  setDesktopPasskeyState,
} from '@/lib/desktop/electron-bridge';
import {
  completeDesktopNativeAuth,
  type DesktopReturnRouteVerificationResult,
} from '@/lib/desktop/native-complete';

type CompletionState = 'loading' | 'error' | 'touch-id-offer';
type TouchIdEnrollState = 'idle' | 'working' | 'error';

const DESKTOP_PASSKEY_NAME = 'Jovie for Mac';

type NativeCompleteErrorClass =
  | 'replay'
  | 'expired'
  | 'wrong_client'
  | 'credential_expired'
  | 'verify_failed'
  | 'unknown';

let completionKey: string | null = null;
let completionPromise: ReturnType<typeof completeDesktopNativeAuth> | null =
  null;

function getCompletionPromise(
  key: string,
  input: Parameters<typeof completeDesktopNativeAuth>[0]
) {
  if (completionKey !== key) {
    completionKey = key;
    completionPromise = null;
  }

  completionPromise ??= completeDesktopNativeAuth(input);
  return completionPromise;
}

function getStoredDesktopAuthReturnTo(): string {
  try {
    const returnTo = globalThis.localStorage.getItem(
      'jovie.desktopAuth.returnTo'
    );
    if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) {
      return returnTo;
    }
  } catch {
    // Missing storage should fall back to the app shell.
  }

  return '/app/chat?runtime=electron';
}

async function verifyDesktopReturnRoute(
  returnTo: string
): Promise<DesktopReturnRouteVerificationResult> {
  const response = await fetch(returnTo, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'follow',
  });
  const finalUrl = new URL(response.url || returnTo, globalThis.location.href);
  if (
    finalUrl.pathname === '/signin' ||
    finalUrl.pathname === '/signup' ||
    finalUrl.pathname === '/sign-in' ||
    finalUrl.pathname === '/sign-up'
  ) {
    return 'unauthenticated';
  }

  return response.ok ? 'ready' : 'unknown';
}

function classifyCompletionError(error: unknown): NativeCompleteErrorClass {
  if (error instanceof Error) {
    const message = error.message;
    if (
      message === 'missing-auth-completion' ||
      message === 'missing-completion'
    ) {
      return 'replay';
    }
    if (message.includes('expired')) {
      return 'expired';
    }
    if (message.includes('wrong_client') || message.includes('wrong-client')) {
      return 'wrong_client';
    }
    if (
      message.includes('credential_expired') ||
      message.includes('ott_expired')
    ) {
      return 'credential_expired';
    }
    if (
      message.includes('verify_failed') ||
      message.includes('verify-failed')
    ) {
      return 'verify_failed';
    }
  }
  return 'unknown';
}

const ERROR_COPY: Record<NativeCompleteErrorClass, string> = {
  replay: 'This sign-in link was already used. Start sign-in again from Jovie.',
  expired: 'Your sign-in link expired. Start sign-in again from Jovie.',
  wrong_client:
    'This sign-in link was for a different app. Start sign-in again from Jovie.',
  credential_expired: 'Your sign-in credentials expired. Try signing in again.',
  verify_failed:
    'Sign-in could not be verified. Close this window and start sign-in again from Jovie.',
  unknown:
    'Sign-in did not complete. Close this window and start sign-in again from Jovie.',
};

function isRecoverableCompletionReplayError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'missing-auth-completion' ||
      error.message === 'missing-completion')
  );
}

function NativeCompleteContent() {
  const { replace } = useRouter();
  const searchKey = useSearchParams().toString();
  const [state, setState] = useState<CompletionState>('loading');
  const [errorClass, setErrorClass] =
    useState<NativeCompleteErrorClass>('unknown');
  const [offerReturnTo, setOfferReturnTo] = useState<string | null>(null);
  const [enrollState, setEnrollState] = useState<TouchIdEnrollState>('idle');

  const openWorkspace = useCallback(
    (returnTo: string) => {
      replace(returnTo);
      globalThis.setTimeout(() => {
        if (globalThis.location?.pathname === '/auth/native-complete') {
          globalThis.location.assign(returnTo);
        }
      }, 500);
    },
    [replace]
  );

  // The sign-in that just finished is fresh, which is exactly when the
  // server lets this Mac add a device passkey (JOV-6727).
  const turnOnTouchId = useCallback(async () => {
    if (!offerReturnTo || enrollState === 'working') return;
    setEnrollState('working');
    try {
      const { authClient } = await import('@/lib/auth/client');
      const added = await authClient.passkey.addPasskey({
        name: DESKTOP_PASSKEY_NAME,
        authenticatorAttachment: 'platform',
      });
      if (added?.error) throw new Error(added.error.message);
      await setDesktopPasskeyState('enrolled');
      openWorkspace(offerReturnTo);
    } catch {
      setEnrollState('error');
    }
  }, [enrollState, offerReturnTo, openWorkspace]);

  const skipTouchId = useCallback(() => {
    if (!offerReturnTo) return;
    // This optional local preference must not delay the completed sign-in.
    void setDesktopPasskeyState('dismissed').catch(() => undefined);
    openWorkspace(offerReturnTo);
  }, [offerReturnTo, openWorkspace]);

  useEffect(() => {
    // Every mounted effect needs its own live subscriber. The shared promise
    // deduplicates the exchange when Strict Mode replays setup and cleanup.
    let isActive = true;
    setState('loading');

    async function completeAuth() {
      try {
        const result = await getCompletionPromise(globalThis.location.href, {
          consumeCompletion: consumeDesktopAuthCompletion,
          verifyReturnRoute: verifyDesktopReturnRoute,
        });

        if (!isActive) return;
        const passkey = await getDesktopPasskeyState();
        if (!isActive) return;
        if (passkey.available && !passkey.enrolled && !passkey.dismissed) {
          setOfferReturnTo(result.returnTo);
          setState('touch-id-offer');
          return;
        }
        openWorkspace(result.returnTo);
      } catch (error) {
        if (!isActive) return;

        // Already-signed-in recovery: if the route verify says we have a
        // session despite the exchange failing, navigate to the stored
        // return route. Plan design row 24: replay recovery keyed off BA
        // `getSession` (verified inside `verifyDesktopReturnRoute`).
        if (isRecoverableCompletionReplayError(error)) {
          const returnTo = getStoredDesktopAuthReturnTo();
          try {
            const verification = await verifyDesktopReturnRoute(returnTo);
            if (!isActive) return;
            if (verification === 'ready') {
              replace(returnTo);
              globalThis.setTimeout(() => {
                if (globalThis.location?.pathname === '/auth/native-complete') {
                  globalThis.location.assign(returnTo);
                }
              }, 500);
              return;
            }
          } catch {
            // Fall through to error display.
          }
        }

        if (!isActive) return;
        setErrorClass(classifyCompletionError(error));
        setState('error');
      }
    }

    void completeAuth();

    return () => {
      isActive = false;
    };
  }, [openWorkspace, replace, searchKey]);

  if (state === 'touch-id-offer') {
    return (
      <main className='grid min-h-dvh place-items-center bg-base px-6 text-white dark:text-white [color-scheme:dark]'>
        <section className='w-full max-w-sm px-6 py-7 text-center'>
          <h1 className='text-xl font-semibold leading-7'>
            Sign In With Touch ID Next Time?
          </h1>
          <p
            className='mt-3 min-h-10 text-sm leading-5 text-white/64'
            aria-live='polite'
          >
            {enrollState === 'error'
              ? 'Touch ID was not turned on. You can keep signing in with the browser.'
              : 'Skip the browser on this Mac. Your fingerprint stays on this Mac.'}
          </p>
          <div className='mt-6 flex flex-col gap-2'>
            <Button
              type='button'
              variant='primary'
              size='lg'
              className='w-full'
              disabled={enrollState === 'working'}
              onClick={turnOnTouchId}
            >
              Turn On Touch ID
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='w-full'
              disabled={enrollState === 'working'}
              onClick={skipTouchId}
            >
              Not Now
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className='grid min-h-dvh place-items-center bg-base px-6 text-white dark:text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <h1 className='text-xl font-semibold leading-7'>
          {state === 'error'
            ? 'Sign-in did not complete'
            : 'Completing sign-in'}
        </h1>
        <p className='mt-3 text-sm leading-5 text-white/64' aria-live='polite'>
          {state === 'error'
            ? ERROR_COPY[errorClass]
            : 'Jovie will open your workspace in a moment.'}
        </p>
      </section>
    </main>
  );
}

export default function NativeCompletePage() {
  return (
    <Suspense fallback={null}>
      <NativeCompleteContent />
    </Suspense>
  );
}
