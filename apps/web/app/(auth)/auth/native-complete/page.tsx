'use client';

import { useClerk, useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { consumeDesktopAuthCompletion } from '@/lib/desktop/electron-bridge';
import { completeDesktopNativeAuth } from '@/lib/desktop/native-complete';

type CompletionState = 'loading' | 'error';

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
        const result = await completeDesktopNativeAuth({
          consumeCompletion: consumeDesktopAuthCompletion,
          signIn,
          setActive: params => clerk.setActive(params),
        });

        if (isActive) {
          router.replace(result.returnTo);
        }
      } catch {
        if (isActive) {
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
