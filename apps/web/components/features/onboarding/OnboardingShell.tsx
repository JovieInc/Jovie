'use client';

import { Skeleton } from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import type { StartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import {
  getBrowserTurnstileHostname,
  resolveTurnstileSiteKey,
} from '@/lib/turnstile/keys';
import { cn } from '@/lib/utils';
import { OnboardingChat } from './OnboardingChat';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
} from './OnboardingProfileRail';
import {
  isOnboardingTurnstilePanelVisible,
  OnboardingTurnstile,
  type OnboardingTurnstileState,
} from './OnboardingTurnstile';
import { useOnboardingClaim } from './useOnboardingClaim';

/**
 * App-shell frame for the anonymous onboarding chat.
 *
 * Holds the Turnstile token until the chat client wires its first request.
 */
interface OnboardingShellProps {
  /** First 8 chars of the session id. Debug breadcrumb only — not sensitive. */
  readonly sessionLabel: string;
  /** ID for a homepage-captured starter prompt stored in localStorage. */
  readonly intentId?: string;
  /** Validated URL-provided context for an automatic first message. */
  readonly starterHandoff?: StartEntryHandoff | null;
}

export function OnboardingShell({
  intentId,
  sessionLabel,
  starterHandoff,
}: OnboardingShellProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [profileBuilderState, setProfileBuilderState] =
    useState<OnboardingProfileBuilderState>(
      EMPTY_ONBOARDING_PROFILE_BUILDER_STATE
    );
  const [turnstileState, setTurnstileState] =
    useState<OnboardingTurnstileState>({
      status: 'loading',
      message: 'Checking your browser before the first message.',
    });
  const [turnstileInstruction, setTurnstileInstruction] = useState<
    string | null
  >(null);
  const [turnstileFocusSignal, setTurnstileFocusSignal] = useState(0);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [claimTrigger, setClaimTrigger] = useState(0);

  useEffect(() => {
    track(ONBOARDING_FUNNEL_EVENTS.ONBOARDING_STARTED, {
      surface: 'start_chat',
    });
  }, []);

  const handleConversationActivity = useCallback(() => {
    setClaimTrigger(current => current + 1);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileInstruction(null);
  }, []);

  const handleTurnstileStateChange = useCallback(
    (nextState: OnboardingTurnstileState) => {
      setTurnstileState(nextState);
      if (nextState.status !== 'verified' && nextState.status !== 'bypassed') {
        setTurnstileToken(null);
      }
      if (nextState.status === 'verified' || nextState.status === 'bypassed') {
        setTurnstileInstruction(null);
      }
    },
    []
  );

  const requestTurnstileVerification = useCallback(
    (message = 'Verify you are human to send') => {
      setTurnstileInstruction(message);
      setTurnstileFocusSignal(current => current + 1);
    },
    []
  );

  const resetTurnstileVerification = useCallback(
    (message = 'Verify you are human to send') => {
      setTurnstileToken(null);
      setTurnstileInstruction(message);
      setTurnstileResetSignal(current => current + 1);
      setTurnstileFocusSignal(current => current + 1);
    },
    []
  );

  const turnstilePanel = (
    <OnboardingTurnstile
      onToken={handleTurnstileToken}
      onStateChange={handleTurnstileStateChange}
      instruction={turnstileInstruction}
      focusSignal={turnstileFocusSignal}
      resetSignal={turnstileResetSignal}
    />
  );
  const turnstilePanelVisible = isOnboardingTurnstilePanelVisible(
    turnstileState,
    turnstileInstruction,
    resolveTurnstileSiteKey(
      getBrowserTurnstileHostname(),
      publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    )
  );

  const isTurnstileUnavailable =
    turnstileState.status === 'error' ||
    turnstileState.status === 'timeout' ||
    turnstileState.status === 'unsupported' ||
    turnstileState.status === 'unconfigured';
  const turnstileFailureMessage = isTurnstileUnavailable
    ? (turnstileState.message ?? 'Verification failed. Try again.')
    : null;

  const handleTurnstileRequired = useCallback(
    (message?: string) => {
      requestTurnstileVerification(message);
    },
    [requestTurnstileVerification]
  );

  const handleTurnstileRejected = useCallback(() => {
    resetTurnstileVerification('Verify you are human to send');
  }, [resetTurnstileVerification]);

  // Auto-claim any anonymous transcript once Better Auth reports the user is
  // authenticated, then retry after completed chat turns. The claim receipt
  // routes controlled-access users to /waitlist and admitted users to checkout.
  const claimStatus = useOnboardingClaim(claimTrigger);
  const isLinking =
    claimStatus === 'pending' || claimStatus === 'retry-after-webhook';
  const sideProfileRail = profileBuilderState.artist ? (
    <OnboardingProfileRail state={profileBuilderState} />
  ) : null;

  return (
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        sidebar={null}
        containerClassName='[color-scheme:dark]'
        contentClassName='overflow-hidden!'
        main={
          <div
            className='relative flex min-h-0 flex-1'
            data-onboarding-session={sessionLabel}
          >
            <div
              className='absolute right-3 top-3 z-30 sm:right-4 sm:top-4'
              data-testid='onboarding-sign-in-header'
            >
              <Link
                className='btn-linear-login focus-ring-themed shrink-0 whitespace-nowrap'
                href={APP_ROUTES.SIGNIN}
              >
                Sign in
              </Link>
            </div>
            <OnboardingChat
              intentId={intentId}
              onConversationActivity={handleConversationActivity}
              onProfileBuilderChange={setProfileBuilderState}
              starterHandoff={starterHandoff}
              turnstileToken={turnstileToken}
              turnstileStatus={turnstileState.status}
              turnstilePanel={turnstilePanel}
              turnstilePanelVisible={turnstilePanelVisible}
              onTurnstileRequired={handleTurnstileRequired}
              onTurnstileRejected={handleTurnstileRejected}
            />

            <OnboardingShellStatus
              kind='error'
              message={turnstileFailureMessage}
              visible={Boolean(turnstileFailureMessage)}
            />
            <OnboardingShellStatus
              kind='status'
              message='Linking your conversation...'
              visible={isLinking}
            />
            <OnboardingShellStatus
              kind='error'
              message="We couldn't save your request. Refresh this page to try again."
              visible={claimStatus === 'error'}
            />
          </div>
        }
        rightPanel={sideProfileRail}
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
        'pointer-events-none absolute right-3 top-3 z-40 max-w-[min(28rem,calc(100%-1.5rem))] rounded-full border bg-surface-0 px-3 py-1.5 text-xs leading-5 shadow-card sm:right-4 sm:top-4',
        'border-red-500/20 text-error'
      )}
      role='alert'
      aria-live='assertive'
    >
      {message}
    </p>
  );
}
