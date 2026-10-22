'use client';

// @coverage-via apps/web/tests/unit/onboarding/OnboardingShell.sign-in-placement.test.tsx

import { Button, Link as JovieLink, Skeleton } from '@jovie/ui';
import type { UIMessage } from 'ai';
import NextLink from 'next/link';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { AppShellFrame } from '@/components/organisms/AppShellFrame';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { publicEnv } from '@/lib/env-public';
import { ONBOARDING_FUNNEL_EVENTS } from '@/lib/onboarding/funnel-events';
import type { StartEntryHandoff } from '@/lib/onboarding/start-entry-handoff';
import {
  buildStartEntryResumeHref,
  type StartEntryProfile,
} from '@/lib/onboarding/start-entry-profile';
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
  readonly accountClaimHandle?: string;
  readonly accountIdentityId?: string;
}

/** Preview state for a prebuilt, unclaimed page so the rail shows it on first paint. */
export function buildEntryProfileBuilderState(
  entryProfile: StartEntryProfile | null | undefined
): OnboardingProfileBuilderState {
  if (entryProfile?.status !== 'claimable') {
    return entryProfile
      ? {
          ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
          handle: entryProfile.handle,
        }
      : EMPTY_ONBOARDING_PROFILE_BUILDER_STATE;
  }
  return {
    artist: {
      id: entryProfile.spotifyId ?? `handle-${entryProfile.handle}`,
      name: entryProfile.displayName,
      url: entryProfile.spotifyUrl ?? '',
      imageUrl: entryProfile.avatarUrl,
      genres: entryProfile.genres,
      followers: entryProfile.spotifyFollowers ?? null,
      latestRelease: entryProfile.latestRelease ?? null,
    },
    artistConfirmed: false,
    handle: entryProfile.handle,
    socialLinks: entryProfile.socialLinks,
  };
}

/** Preserve known links for the same identity, never for a different artist/job. */
export function mergeEntryProfileBuilderState(
  entry: OnboardingProfileBuilderState,
  chat: OnboardingProfileBuilderState
): OnboardingProfileBuilderState {
  if (
    chat.profileDraft?.activeRole &&
    chat.profileDraft.activeRole !== 'artist'
  )
    return chat;
  const sameArtist = !chat.artist || chat.artist.id === entry.artist?.id;
  return {
    ...chat,
    artist:
      sameArtist && chat.artist
        ? {
            ...entry.artist,
            ...chat.artist,
            followers: chat.artist.followers ?? entry.artist?.followers,
            latestRelease:
              entry.artist?.latestRelease ?? chat.artist.latestRelease,
          }
        : (chat.artist ?? entry.artist),
    handle: chat.handle ?? (sameArtist ? entry.handle : null),
    socialLinks: sameArtist
      ? [...new Set([...entry.socialLinks, ...chat.socialLinks])]
      : chat.socialLinks,
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
  accountClaimHandle,
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
  const turnstileSiteKey = resolveOnboardingTurnstileSiteKey(
    getBrowserTurnstileHostname(),
    publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    turnstileTestMode
  );
  const turnstilePanelVisible = isOnboardingTurnstilePanelVisible(
    turnstileState,
    turnstileInstruction,
    turnstileSiteKey
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
    !accountClaimHandle && (!resumeOwnedConversation || claimTrigger > 0)
  );
  const isLinking =
    claimStatus === 'pending' || claimStatus === 'retry-after-webhook';
  const resumePath = buildStartEntryResumeHref(entryProfile);
  const signInPath = `${APP_ROUTES.SIGNIN}?${new URLSearchParams({ redirect_url: resumePath })}`;
  const entryBuilderState = useMemo(
    () => buildEntryProfileBuilderState(entryProfile),
    [entryProfile]
  );
  // The chat's own state wins once it knows anything; until then the rail
  // previews the prebuilt page from `?handle=`.
  const railState = mergeEntryProfileBuilderState(
    entryBuilderState,
    profileBuilderState
  );
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
                <OnboardingIdentityConflict
                  visible={
                    claimStatus === 'identity-conflict' ||
                    Boolean(accountClaimHandle)
                  }
                  accountClaimHandle={accountClaimHandle}
                  recoveryHandle={
                    entryProfile?.handle ?? railState.handle ?? undefined
                  }
                  isSignedIn={isSignedIn}
                  onLogout={onLogout}
                  disabled={actionPending || controlsDisabled}
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
                  {isSignedIn && onLogout && !accountClaimHandle ? (
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
                      <NextLink href={signInPath}>Sign in</NextLink>
                    </JovieLink>
                  ) : null}
                </OnboardingIdentityConflict>
              ) : null}
              <OnboardingChat
                initialMessages={initialMessages}
                conversationId={conversationId}
                interactionDisabled={
                  actionPending || Boolean(accountClaimHandle)
                }
                onBusyChange={onBusyChange}
                headerOverlay={!isSignedIn}
                intentId={intentId}
                onConversationActivity={handleConversationActivity}
                onProfileBuilderChange={setProfileBuilderState}
                starterHandoff={starterHandoff}
                entryProfile={entryProfile}
                previewState={railState}
                turnstileToken={turnstileToken}
                turnstileStatus={turnstileState.status}
                turnstilePanel={turnstilePanel}
                turnstilePanelVisible={turnstilePanelVisible}
                turnstileHasSiteKey={Boolean(turnstileSiteKey)}
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

/** Async recovery uses the existing header; details expand only on explicit request. */
export function OnboardingIdentityConflict({
  visible,
  isSignedIn,
  onLogout,
  disabled = false,
  accountClaimHandle,
  recoveryHandle,
  children,
}: Readonly<{
  visible: boolean;
  isSignedIn: boolean;
  onLogout?: () => void;
  disabled?: boolean;
  accountClaimHandle?: string;
  recoveryHandle?: string;
  children?: ReactNode;
}>) {
  const [expanded, setExpanded] = useState(Boolean(accountClaimHandle));
  const recoveryMessage = accountClaimHandle
    ? `This account already has a profile. Open your workspace to choose a profile, or switch accounts to continue with @${accountClaimHandle}.`
    : 'This artist already has a Jovie profile. Sign in with the original account or use the verified profile claim flow.';
  const detailsId = useId();
  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);
  return (
    <div className='shrink-0' data-testid='onboarding-identity-recovery-slot'>
      <div
        className='flex h-11 shrink-0 items-center justify-end gap-2 overflow-x-auto px-3 sm:px-4'
        data-testid='onboarding-sign-in-header'
      >
        {visible ? (
          <>
            <span role='alert' aria-live='assertive' className='sr-only'>
              {recoveryMessage}
            </span>
            <Button
              variant='ghost'
              size='sm'
              className='mr-auto shrink-0'
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded(value => !value)}
            >
              {accountClaimHandle
                ? `Continue with @${accountClaimHandle}`
                : 'Profile Conflict'}
            </Button>
          </>
        ) : null}
        {children}
      </div>
      {visible && expanded ? (
        <div
          className='flex flex-col items-start gap-2 px-3 py-2 sm:px-4'
          id={detailsId}
          data-testid='onboarding-identity-conflict'
        >
          <p className='text-xs leading-5 text-error'>{recoveryMessage}</p>
          {accountClaimHandle ? (
            <JovieLink asChild variant='compact' touchTarget>
              <NextLink href={APP_ROUTES.DASHBOARD}>
                Open Your Workspace
              </NextLink>
            </JovieLink>
          ) : null}
          {isSignedIn && onLogout ? (
            <Button
              variant='ghost'
              size='sm'
              disabled={disabled}
              onClick={onLogout}
            >
              Switch Account
            </Button>
          ) : !isSignedIn ? (
            <JovieLink asChild variant='compact' touchTarget>
              <NextLink
                href={
                  recoveryHandle
                    ? `${APP_ROUTES.SIGNIN}?${new URLSearchParams({ redirect_url: `${APP_ROUTES.START}?${new URLSearchParams({ handle: recoveryHandle })}` })}`
                    : APP_ROUTES.SIGNIN
                }
              >
                Sign in with original account
              </NextLink>
            </JovieLink>
          ) : null}
        </div>
      ) : null}
    </div>
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
