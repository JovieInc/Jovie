'use client';

import { useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { consumeDesktopAuthCompletion } from '@/lib/desktop/electron-bridge';

type CompletionState = 'loading' | 'error';

interface NativeExchangeResponse {
  readonly ticket: string;
  readonly returnTo: string;
}

async function exchangeDesktopCompletion(): Promise<NativeExchangeResponse> {
  const completionResult = await consumeDesktopAuthCompletion();
  if (!completionResult.ok) {
    throw new Error(completionResult.reason ?? 'missing-auth-completion');
  }

  const { code, state, codeVerifier } = completionResult.completion;
  const response = await fetch('/api/auth/native/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client: 'electron',
      code,
      state,
      codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error('native-auth-exchange-failed');
  }

  const payload = (await response.json()) as Partial<NativeExchangeResponse>;
  if (typeof payload.ticket !== 'string' || payload.ticket.length === 0) {
    throw new Error('native-auth-exchange-missing-ticket');
  }
  if (
    typeof payload.returnTo !== 'string' ||
    !payload.returnTo.startsWith('/')
  ) {
    throw new Error('native-auth-exchange-missing-return');
  }

  return {
    ticket: payload.ticket,
    returnTo: payload.returnTo,
  };
}

function NativeCompleteContent() {
  const router = useRouter();
  const { signIn } = useSignIn();
  const [state, setState] = useState<CompletionState>('loading');

  useEffect(() => {
    let isActive = true;

    async function completeAuth() {
      try {
        const exchange = await exchangeDesktopCompletion();
        const ticketAttempt = await signIn.ticket({
          ticket: exchange.ticket,
        });
        if (ticketAttempt.error) {
          throw ticketAttempt.error;
        }

        const finalizeAttempt = await signIn.finalize();
        if (finalizeAttempt.error) {
          throw finalizeAttempt.error;
        }
        if (isActive) {
          router.replace(exchange.returnTo);
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
  }, [router, signIn]);

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
