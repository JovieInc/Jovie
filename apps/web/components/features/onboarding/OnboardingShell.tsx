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
      className='flex min-h-dvh w-full flex-col bg-(--linear-app-content-surface) text-primary-token [color-scheme:dark]'
      data-onboarding-session={sessionLabel}
    >
      <header className='flex h-12 items-center justify-between px-4 sm:px-6'>
        <div className='inline-flex items-center gap-2'>
          <BrandLogo size={20} tone='auto' aria-hidden />
          <span className='text-[15px] font-semibold text-primary-token'>
            Jovie
          </span>
        </div>
      </header>

      <main className='flex min-h-0 flex-1 overflow-hidden px-3 pb-14 sm:px-6 sm:pb-6'>
        <section
          className='mx-auto flex min-h-0 w-full max-w-[56rem] flex-1 overflow-hidden rounded-[20px] border border-subtle bg-surface-1 shadow-card'
          aria-label='Jovie onboarding chat'
        >
          <OnboardingChat
            onConversationActivity={handleConversationActivity}
            turnstileToken={turnstileToken}
          />
        </section>
      </main>

      <OnboardingTurnstile
        onToken={handleTurnstileToken}
        onError={handleTurnstileError}
      />

      {turnstileError ? (
        <p
          className='fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-red-500/20 bg-error-subtle px-3 py-1 text-[12px] text-error'
          role='alert'
        >
          {turnstileError}
        </p>
      ) : null}

      {isLinking ? (
        <p
          className='fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-subtle bg-surface-1 px-3 py-1 text-[12px] text-secondary-token'
          role='status'
          aria-live='polite'
        >
          Linking your conversation…
        </p>
      ) : null}
    </div>
  );
}
