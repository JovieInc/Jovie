'use client';

// @coverage-via apps/web/tests/unit/onboarding/OnboardingShell.sign-in-placement.test.tsx

import { Button, Link as JovieLink, Skeleton } from '@jovie/ui';
import type { UIMessage } from 'ai';
import NextLink from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import type { StartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';
import {
  getBrowserTurnstileHostname,
  resolveOnboardingTurnstileSiteKey,
} from '@/lib/turnstile/keys';
import { cn } from '@/lib/utils';
import { OnboardingChat } from './OnboardingChat';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
  OnboardingProfileRail,
  resolvePreviewArtist,
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
export interface OnboardingShellProps {
  readonly initialMessages?: UIMessage[];
  readonly conversationId?: string | null;
  readonly resumeOwnedConversation?: boolean;
  readonly onRestart?: () => void;
  readonly onLogout?: () => void;
  readonly actionPending?: boolean;
  readonly controlsDisabled?: boolean;
  readonly actionError?: string | null;
  readonly onBusyChange?: (busy: boolean) => void;
  /** Whether the server resolved a verified account for this request. */
  readonly isSignedIn?: boolean;
  /** First 8 chars of the session id. Debug breadcrumb only — not sensitive. */
  readonly sessionLabel: string;
  /** ID for a homepage-captured starter prompt stored in localStorage. */
  readonly intentId?: string;
  /** Validated URL-provided context for an automatic first message. */
  readonly starterHandoff?: StartEntryHandoff | null;
  /**
   * Server-resolved synthetic principal passage (JOV-7697): mount the
   * Cloudflare test sitekey. Never derived from client input.
   */
  readonly turnstileTestMode?: boolean;
  /** The real page behind `?handle=`, shown before the visitor types. */
  readonly entryProfile?: StartEntryProfile | null;
}

/** Preview state for a prebuilt, unclaimed page so the rail shows it on first paint. */
export function buildEntryProfileBuilderState(
  entryProfile: StartEntryProfile | null | undefined
): OnboardingProfileBuilderState {
  if (entryProfile?.status !== 'claimable') {
    return EMPTY_ONBOARDING_PROFILE_BUILDER_STATE;
  }
  return {
    artist: {
      id: entryProfile.spotifyId ?? `handle-${entryProfile.handle}`,
      name: entryProfile.displayName,
      url: entryProfile.spotifyUrl ?? '',
      imageUrl: entryProfile.avatarUrl,
      genres: entryProfile.genres,
    },
    artistConfirmed: false,
    handle: entryProfile.handle,
    socialLinks: entryProfile.socialLinks,
  };
}

export function OnboardingShell({
  isSignedIn = false,
  intentId,
  sessionLabel,
  starterHandoff,
  turnstileTestMode = false,
  entryProfile,
  initialMessages = [],
  conversationId = null,
  resumeOwnedConversation = false,
  onRestart,
  onLogout,
  actionPending = false,
  controlsDisabled = false,
  actionError = null,
  onBusyChange,
}: OnboardingShellProps) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [profileBuilderState, setProfileBuilderState] =
    useState<OnboardingProfileBuilderState>(
      EMPTY_ONBOARDING_PROFILE_BUILDER_STATE
    );
  const [turnstileState, setTurnstileState] =
    useState<OnboardingTurnstileState>({
      status: 'loading',
      message: 'Starting your chat.',
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
    (message = 'One quick check before we send') => {
      setTurnstileInstruction(message);
      setTurnstileFocusSignal(current => current + 1);
    },
    []
  );

  const resetTurnstileVerification = useCallback(
    (message = 'One quick check before we send') => {
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
      testMode={turnstileTestMode}
    />
  );
  const turnstilePanelVisible = isOnboardingTurnstilePanelVisible(
    turnstileState,
    turnstileInstruction,
    resolveOnboardingTurnstileSiteKey(
      getBrowserTurnstileHostname(),
      publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      turnstileTestMode
    )
  );

  const isTurnstileUnavailable =
    turnstileState.status === 'error' ||
    turnstileState.status === 'timeout' ||
    turnstileState.status === 'unsupported' ||
    turnstileState.status === 'unconfigured';
  const turnstileFailureMessage = isTurnstileUnavailable
    ? (turnstileState.message ??
      "We couldn't start your chat. Refresh the page to try again.")
    : null;

  const handleTurnstileRequired = useCallback(
    (message?: string) => {
      requestTurnstileVerification(message);
    },
    [requestTurnstileVerification]
  );

  const handleTurnstileRejected = useCallback(() => {
    resetTurnstileVerification('One quick check before we send');
  }, [resetTurnstileVerification]);

  // Auto-claim any anonymous transcript once Better Auth reports the user is
  // authenticated, then retry after completed chat turns. Durable waitlist
  // receipts route to /waitlist; admitted users go to checkout; missing
  // artist identity stays in this chat.
  const claimStatus = useOnboardingClaim(
    claimTrigger,
    !resumeOwnedConversation || claimTrigger > 0
  );
  const isLinking =
    claimStatus === 'pending' || claimStatus === 'retry-after-webhook';
  const entryBuilderState = useMemo(
    () => buildEntryProfileBuilderState(entryProfile),
    [entryProfile]
  );
  // The chat's own state wins once it knows anything; until then the rail
  // previews the prebuilt page from `?handle=`.
  const railState = resolvePreviewArtist(profileBuilderState)
    ? profileBuilderState
    : entryBuilderState;
  const sideProfileRail = resolvePreviewArtist(railState) ? (
    <OnboardingProfileRail state={railState} />
  ) : null;

  return (
    <SidebarProvider defaultOpen={false}>
      <AppShellFrame
        sidebar={null}
        containerClassName='[color-scheme:dark]'
        contentClassName='overflow-hidden!'
        main={
          <div className='flex min-h-0 min-w-0 flex-1'>
            <div
              className='relative flex min-h-0 min-w-0 flex-1 flex-col'
              data-onboarding-session={sessionLabel}
            >
              {onRestart || onLogout || !isSignedIn ? (
                <div
                  className='flex min-h-11 shrink-0 items-center justify-end gap-2 px-3 sm:px-4'
                  data-testid='onboarding-sign-in-header'
                >
                  {onRestart ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='shrink-0 whitespace-nowrap'
                      disabled={actionPending || controlsDisabled}
                      onClick={onRestart}
                    >
                      Start Over
                    </Button>
                  ) : null}
                  {isSignedIn && onLogout ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='shrink-0 whitespace-nowrap'
                      disabled={actionPending || controlsDisabled}
                      onClick={onLogout}
                    >
                      Log Out
                    </Button>
                  ) : null}
                  {!isSignedIn ? (
                    <JovieLink
                      asChild
                      variant='compact'
                      touchTarget
                      className='shrink-0 whitespace-nowrap'
                    >
                      <NextLink href={APP_ROUTES.SIGNIN}>Sign in</NextLink>
                    </JovieLink>
                  ) : null}
                </div>
              ) : null}
              <OnboardingChat
                initialMessages={initialMessages}
                conversationId={conversationId}
                interactionDisabled={actionPending}
                onBusyChange={onBusyChange}
                headerOverlay={!isSignedIn}
                intentId={intentId}
                onConversationActivity={handleConversationActivity}
                onProfileBuilderChange={setProfileBuilderState}
                starterHandoff={starterHandoff}
                entryProfile={entryProfile}
                turnstileToken={turnstileToken}
                turnstileStatus={turnstileState.status}
                turnstilePanel={turnstilePanel}
                turnstilePanelVisible={turnstilePanelVisible}
                onTurnstileRequired={handleTurnstileRequired}
                onTurnstileRejected={handleTurnstileRejected}
              />

              <OnboardingShellStatus
                kind='error'
                message={actionError}
                visible={Boolean(actionError)}
              />

              <OnboardingShellStatus
                kind='error'
                message='This Spotify artist already has a Jovie profile. Sign in with the original account or use the verified profile claim flow. Choosing another handle will not resolve this conflict.'
                visible={claimStatus === 'identity-conflict'}
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
            {sideProfileRail ? (
              <div className='hidden shrink-0 lg:flex'>{sideProfileRail}</div>
            ) : null}
          </div>
        }
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
        <div className='flex h-3.5 w-44'>
          <Skeleton className='flex-1' rounded='md' />
        </div>
        <span className='sr-only'>{message}</span>
      </div>
    );
  }

  return (
    <p
      className={cn(
        'pointer-events-none absolute right-3 top-3 z-40 max-w-[min(28rem,calc(100%-1.5rem))] rounded-full border bg-surface-0 px-3 py-1.5 text-xs leading-5 shadow-card sm:right-4 sm:top-4',
        'border-error/20 text-error'
      )}
      role='alert'
      aria-live='assertive'
    >
      {message}
    </p>
  );
}
