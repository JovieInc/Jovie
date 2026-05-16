'use client';

import { useCallback, useState } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';
import { OnboardingChat } from './OnboardingChat';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
} from './OnboardingProfileRail';
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

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  );
}

function areProfileArtistsEqual(
  left: OnboardingProfileBuilderState['artist'],
  right: OnboardingProfileBuilderState['artist']
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.url === right.url &&
    left.imageUrl === right.imageUrl &&
    left.followers === right.followers &&
    left.popularity === right.popularity &&
    areStringArraysEqual(left.genres ?? [], right.genres ?? [])
  );
}

function areProfileBuilderStatesEqual(
  left: OnboardingProfileBuilderState,
  right: OnboardingProfileBuilderState
): boolean {
  return (
    left.artistConfirmed === right.artistConfirmed &&
    left.handle === right.handle &&
    areProfileArtistsEqual(left.artist, right.artist) &&
    areStringArraysEqual(left.socialLinks, right.socialLinks)
  );
}

export function OnboardingShell({ sessionLabel }: OnboardingShellProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const [claimTrigger, setClaimTrigger] = useState(0);
  const [profileBuilderState, setProfileBuilderState] =
    useState<OnboardingProfileBuilderState>(
      EMPTY_ONBOARDING_PROFILE_BUILDER_STATE
    );

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

  const handleProfileBuilderChange = useCallback(
    (nextState: OnboardingProfileBuilderState) => {
      setProfileBuilderState(current =>
        areProfileBuilderStatesEqual(current, nextState) ? current : nextState
      );
    },
    []
  );

  // Auto-claim any anonymous transcript onto the user the moment Clerk
  // reports they're authenticated, then retry after completed chat turns.
  // On success, this hook navigates away to
  // /onboarding/checkout, so the rest of the shell never gets a chance to
  // render a "now what?" state. Idle for unauthenticated visitors.
  const claimStatus = useOnboardingClaim(claimTrigger);
  const isLinking =
    claimStatus === 'pending' || claimStatus === 'retry-after-webhook';
  const shouldShowProfileRail = Boolean(profileBuilderState.artist);

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
              onProfileBuilderChange={handleProfileBuilderChange}
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
        rightPanel={
          shouldShowProfileRail ? (
            <OnboardingProfileRail state={profileBuilderState} />
          ) : null
        }
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

  return (
    <p
      className={cn(
        'pointer-events-none absolute right-3 top-3 z-40 max-w-[min(28rem,calc(100%-1.5rem))] rounded-full border bg-surface-0 px-3 py-1.5 text-[12px] leading-5 shadow-card sm:right-4 sm:top-4',
        kind === 'error'
          ? 'border-red-500/20 text-error'
          : 'border-subtle text-secondary-token'
      )}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      {message}
    </p>
  );
}
