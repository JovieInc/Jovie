'use client';

import { Skeleton } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';
import { OnboardingChat } from './OnboardingChat';
import { OnboardingTurnstile } from './OnboardingTurnstile';
import { useOnboardingClaim } from './useOnboardingClaim';

/**
 * App-shell frame for the anonymous onboarding chat.
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
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        variant='shellChatV1'
        sidebar={null}
        containerClassName='[color-scheme:dark]'
        contentClassName='!overflow-hidden'
        main={
          <div
            className='relative flex min-h-0 flex-1'
            data-onboarding-session={sessionLabel}
          >
            <OnboardingChat
              onConversationActivity={handleConversationActivity}
              turnstileToken={turnstileToken}
            />

            <OnboardingShellStatus
              kind='error'
              message={turnstileError}
              visible={Boolean(turnstileError)}
            />
            <OnboardingShellStatus
              kind='status'
              message='Linking your conversation...'
              visible={isLinking}
            />
          </div>
        }
        rightPanel={null}
      />

      <OnboardingTurnstile
        onToken={handleTurnstileToken}
        onError={handleTurnstileError}
      />
    </SidebarProvider>
  );
}

function OnboardingShellStatus({
  kind,
  message,
  visible,
}: Readonly<{
  kind: 'error' | 'status';
  message: string | null;
  visible: boolean;
}>) {
  if (!visible || !message) return null;

  if (kind === 'status') {
    return (
      <div
        className='pointer-events-none absolute right-3 top-3 z-40 max-w-[min(28rem,calc(100%-1.5rem))] rounded-full border border-subtle bg-surface-0 px-3 py-1.5 shadow-card sm:right-4 sm:top-4'
        role='status'
        aria-live='polite'
        aria-busy='true'
        data-testid='onboarding-linking-skeleton'
      >
        <Skeleton className='h-3.5 w-44 rounded' />
        <span className='sr-only'>{message}</span>
      </div>
    );
  }

  return (
    <p
      className={cn(
        'pointer-events-none absolute right-3 top-3 z-40 max-w-[min(28rem,calc(100%-1.5rem))] rounded-full border bg-surface-0 px-3 py-1.5 text-[12px] leading-5 shadow-card sm:right-4 sm:top-4',
        'border-red-500/20 text-error'
      )}
      role='alert'
      aria-live='assertive'
    >
      {message}
    </p>
  );
}
