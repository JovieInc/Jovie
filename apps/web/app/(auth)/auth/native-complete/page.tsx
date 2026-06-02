'use client';

import { useClerk, useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { consumeDesktopAuthCompletion } from '@/lib/desktop/electron-bridge';
import { completeDesktopNativeAuth } from '@/lib/desktop/native-complete';

type CompletionState = 'loading' | 'error';
type ClerkBrowserGlobal = {
  readonly Clerk?: {
    readonly load?: () => Promise<void> | void;
  };
};

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

async function reloadBrowserClerk() {
  await (globalThis as ClerkBrowserGlobal).Clerk?.load?.();
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

function NativeCompleteContent() {
  const router = useRouter();
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const [state, setState] = useState<CompletionState>('loading');
  const didStartCompletionRef = useRef(false);

  useEffect(() => {
    if (
      !clerk.loaded ||
      !signIn ||
      !clerk.setActive ||
      didStartCompletionRef.current
    ) {
      return;
    }

    let isActive = true;
    didStartCompletionRef.current = true;
    setState('loading');

    async function completeAuth() {
      try {
        const result = await getCompletionPromise(globalThis.location.href, {
          consumeCompletion: consumeDesktopAuthCompletion,
          signIn,
          setActive: params => clerk.setActive(params),
          reloadClerk: reloadBrowserClerk,
          getActiveSessionId: () => clerk.session?.id ?? null,
          getActiveUserId: () => clerk.user?.id ?? null,
        });

        if (isActive) {
          router.replace(result.returnTo);
          globalThis.setTimeout(() => {
            if (globalThis.location.pathname === '/auth/native-complete') {
              globalThis.location.assign(result.returnTo);
            }
          }, 500);
        }
      } catch {
        if (isActive) {
          if (clerk.session) {
            const returnTo = getStoredDesktopAuthReturnTo();
            router.replace(returnTo);
            globalThis.setTimeout(() => {
              if (globalThis.location.pathname === '/auth/native-complete') {
                globalThis.location.assign(returnTo);
              }
            }, 500);
            return;
          }

          setState('error');
        }
      }
    }

    void completeAuth();

    return () => {
      isActive = false;
    };
  }, [clerk, router, signIn]);

  return (
    <main className='grid min-h-dvh place-items-center bg-[#06070a] px-6 text-white [color-scheme:dark]'>
      <section className='w-full max-w-sm px-6 py-7 text-center'>
        <h1 className='text-[22px] font-semibold leading-7'>
          {state === 'error'
            ? 'Sign-in did not complete'
            : 'Completing sign-in'}
        </h1>
        <p className='mt-3 text-[14px] leading-5 text-white/64'>
          {state === 'error'
            ? 'Close this window and start sign-in again from Jovie.'
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
