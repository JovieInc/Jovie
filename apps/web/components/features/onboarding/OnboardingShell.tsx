'use client';

import { useCallback, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { OnboardingChat } from './OnboardingChat';
import { OnboardingTurnstile } from './OnboardingTurnstile';
import { useOnboardingClaim } from './useOnboardingClaim';

/**
 * Outer shell for the anonymous onboarding chat (JOV-2132 PR 3).
 *
 * v1 is a calm, dark canvas with the chat as the only thing on the page.
 * Cinematic reveal choreography (per the plan's 6-stage state machine)
 * lands incrementally after real-artist watch sessions inform the timing.
 *
 * Holds the Turnstile token until the chat client wires its first request.
 */
interface OnboardingShellProps {
  /** First 8 chars of the session id. Debug breadcrumb only — not sensitive. */
  readonly sessionLabel: string;
}

export function OnboardingShell({ sessionLabel }: OnboardingShellProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [claimTrigger, setClaimTrigger] = useState(0);

  const handleConversationActivity = useCallback(() => {
    setClaimTrigger(current => current + 1);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(null);
  }, []);

  const handleTurnstileError = useCallback((message: string) => {
    setTurnstileError(message);
  }, []);

  // Auto-claim any anonymous transcript onto the user the moment Clerk
  // reports they're authenticated, then retry after completed chat turns.
  // On success, this hook navigates away to
  // /onboarding/checkout, so the rest of the shell never gets a chance to
  // render a "now what?" state. Idle for unauthenticated visitors.
  const claimStatus = useOnboardingClaim(claimTrigger);
  const isLinking =
    claimStatus === 'pending' || claimStatus === 'retry-after-webhook';

  return (
    <div
      className='flex min-h-dvh w-full flex-col bg-[#06070a] text-white [color-scheme:dark]'
      data-onboarding-session={sessionLabel}
    >
      <header className='flex h-12 items-center justify-between px-4 sm:px-6'>
        <div className='inline-flex items-center gap-2'>
          <BrandLogo size={20} tone='white' aria-hidden />
          <span className='text-[15px] font-semibold text-white'>Jovie</span>
        </div>
      </header>

      <main className='mx-auto flex w-full max-w-[680px] flex-1 flex-col px-4 pb-4 sm:px-6'>
        <OnboardingChat
          onConversationActivity={handleConversationActivity}
          turnstileToken={turnstileToken}
        />
      </main>

      <OnboardingTurnstile
        onToken={handleTurnstileToken}
        onError={handleTurnstileError}
      />

      {turnstileError ? (
        <p
          className='fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-red-500/15 px-3 py-1 text-[12px] text-red-300'
          role='alert'
        >
          {turnstileError}
        </p>
      ) : null}

      {isLinking ? (
        <p
          className='fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 text-[12px] text-white/70'
          role='status'
          aria-live='polite'
        >
          linking your conversation…
        </p>
      ) : null}
    </div>
  );
}
