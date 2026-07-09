'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { consumeDesktopAuthCompletion } from '@/lib/desktop/electron-bridge';
import {
  completeDesktopNativeAuth,
  type DesktopReturnRouteVerificationResult,
} from '@/lib/desktop/native-complete';

type CompletionState = 'loading' | 'error';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<CompletionState>('loading');
  const [errorClass, setErrorClass] =
    useState<NativeCompleteErrorClass>('unknown');
  const didStartCompletionRef = useRef(false);

  useEffect(() => {
    if (didStartCompletionRef.current) {
      return;
    }
    didStartCompletionRef.current = true;

    let isActive = true;
    setState('loading');

    async function completeAuth() {
      try {
        const result = await getCompletionPromise(globalThis.location.href, {
          consumeCompletion: consumeDesktopAuthCompletion,
          verifyReturnRoute: verifyDesktopReturnRoute,
        });

        if (isActive) {
          router.replace(result.returnTo);
          globalThis.setTimeout(() => {
            if (globalThis.location.pathname === '/auth/native-complete') {
              globalThis.location.assign(result.returnTo);
            }
          }, 500);
        }
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
            if (verification === 'ready') {
              router.replace(returnTo);
              globalThis.setTimeout(() => {
                if (globalThis.location.pathname === '/auth/native-complete') {
                  globalThis.location.assign(returnTo);
                }
              }, 500);
              return;
            }
          } catch {
            // Fall through to error display.
          }
        }

        setErrorClass(classifyCompletionError(error));
        setState('error');
      }
    }

    void completeAuth();

    return () => {
      isActive = false;
    };
  }, [router, searchParams]);

  return (
    <main className='grid min-h-dvh place-items-center bg-background px-6 text-white dark:text-white [color-scheme:dark]'>
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
