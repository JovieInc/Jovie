'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  AlertCircle,
  Archive,
  Check,
  Copy,
  Ellipsis,
  RefreshCw,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatEntityPanelProvider } from '@/app/app/(shell)/chat/ChatEntityPanelContext';
import { ChatEntityRightPanelHost } from '@/app/app/(shell)/chat/ChatEntityRightPanelHost';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { JovieChat } from '@/components/jovie/JovieChat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DRAWER_HEADER_ICON_BUTTON_CLASSNAME } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useClipboard } from '@/hooks/useClipboard';
import { env } from '@/lib/env-client';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  ONBOARDING_PREVIEW_SNAPSHOT_KEY,
  ONBOARDING_WELCOME_REPLY_KEY,
} from '@/lib/onboarding/session-keys';
import {
  useDashboardSocialLinksQuery,
  useDeleteConversationMutation,
} from '@/lib/queries';
import { addBreadcrumb, captureMessage } from '@/lib/sentry/client-lite';
import { getHometownFromSettings } from '@/types/db';

interface ChatPageClientProps {
  readonly conversationId?: string;
  readonly isFirstSession?: boolean;
}

const WELCOME_CHAT_BOOTSTRAP_RETRY_DELAYS_MS = [1500, 3000, 5000] as const;

type WelcomeChatBootstrapState =
  | 'idle'
  | 'pending'
  | 'scheduled'
  | 'done'
  | 'failed';

export function shouldRetryWelcomeChatBootstrap(
  status: number | null
): boolean {
  return (
    status === null ||
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function resetWelcomeChatBootstrapState(
  stateRef: { current: WelcomeChatBootstrapState },
  retryCountRef: { current: number }
): void {
  stateRef.current = 'idle';
  retryCountRef.current = 0;
}

/**
 * Header badge that displays the conversation title as a subtle breadcrumb suffix.
 * Rendered inside the DashboardHeader via HeaderActionsContext.
 */
function ChatTitleBadge({ title }: { readonly title: string }) {
  return (
    <span className='flex min-w-0 items-center gap-2 rounded-xl border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-2.5 py-1.5'>
      <span className='shrink-0 text-[11px] font-[560] tracking-normal text-tertiary-token'>
        Thread
      </span>
      <span className='block max-w-[220px] truncate text-[12px] font-[510] text-primary-token'>
        {title}
      </span>
    </span>
  );
}

interface ChatProfileFallbackProps {
  readonly needsOnboarding: boolean;
  readonly dashboardLoadError: unknown;
  readonly isProfileSetupRace: boolean;
  readonly canAutoRetry: boolean;
  readonly autoRetryCount: number;
  readonly onRetry: () => void;
}

function ChatProfileFallback({
  needsOnboarding,
  dashboardLoadError,
  isProfileSetupRace,
  canAutoRetry,
  autoRetryCount,
  onRetry,
}: ChatProfileFallbackProps) {
  if (needsOnboarding && !dashboardLoadError) {
    return (
      <ChatWorkspaceSurface>
        <div className='flex h-full items-center justify-center p-6'>
          <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
            <LoadingSpinner size='lg' tone='muted' />
            <p className='text-sm text-secondary-token'>
              Taking you to onboarding…
            </p>
          </ContentSurfaceCard>
        </div>
      </ChatWorkspaceSurface>
    );
  }

  const profileMessage = isProfileSetupRace
    ? 'Finishing your dashboard setup…'
    : 'We hit a problem loading your profile. Please retry in a moment.';

  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full items-center justify-center p-6'>
        <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
          {isProfileSetupRace ? (
            <LoadingSpinner size='lg' tone='muted' />
          ) : (
            <AlertCircle className='h-8 w-8 text-tertiary-token' />
          )}
          <p className='text-sm text-secondary-token'>{profileMessage}</p>
          {isProfileSetupRace && canAutoRetry && (
            <p className='text-xs text-tertiary-token'>
              Retrying automatically in 3 seconds ({autoRetryCount + 1}/3)…
            </p>
          )}
          {!isProfileSetupRace && (
            <Button
              onClick={onRetry}
              variant='secondary'
              size='sm'
              className='gap-2'
            >
              <RefreshCw className='h-4 w-4' />
              Retry
            </Button>
          )}
        </ContentSurfaceCard>
      </div>
    </ChatWorkspaceSurface>
  );
}

export function ChatPageClient({
  conversationId,
  isFirstSession = false,
}: ChatPageClientProps) {
  const {
    selectedProfile,
    creatorProfiles,
    needsOnboarding,
    dashboardLoadError,
    isFirstSession: dashboardIsFirstSession,
  } = useDashboardData();
  const { setPreviewData } = usePreviewPanelData();
  const { isOpen: isPreviewPanelOpen, open: openPreviewPanel } =
    usePreviewPanelState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const notifications = useNotifications();
  const [initialQueryHandled, setInitialQueryHandled] = useState(false);
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [_welcomeChatBootstrapState, setWelcomeChatBootstrapState] =
    useState<WelcomeChatBootstrapState>('idle');
  const welcomeChatBootstrapStateRef =
    useRef<WelcomeChatBootstrapState>('idle');
  const welcomeChatRetryCountRef = useRef(0);
  const welcomeChatRetryTimeoutRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);

  const setWelcomeChatBootstrapStatus = useCallback(
    (nextState: WelcomeChatBootstrapState) => {
      welcomeChatBootstrapStateRef.current = nextState;
      setWelcomeChatBootstrapState(nextState);
    },
    []
  );

  const hasProfilesButNoSelection =
    creatorProfiles.length > 0 && !selectedProfile && !needsOnboarding;
  const fallbackProfile = hasProfilesButNoSelection ? creatorProfiles[0] : null;
  const activeProfile = selectedProfile ?? fallbackProfile;
  const hasDashboardLoadFailure = Boolean(dashboardLoadError);
  const isProfileSetupRace =
    hasProfilesButNoSelection && !hasDashboardLoadFailure;
  const canAutoRetry = isProfileSetupRace && autoRetryCount < 3;
  const enablePreviewPanel = !env.IS_E2E;
  const fromOnboarding = searchParams.get('from') === 'onboarding';
  const panelParam = searchParams.get('panel');
  // Hydrate only when the panel is open, deep-linked, or onboarding requested it.
  // This keeps closed chat routes cheap while allowing sidebar/mobile profile clicks.
  const shouldHydratePreviewPanel =
    enablePreviewPanel &&
    (isPreviewPanelOpen || panelParam === 'profile' || fromOnboarding);

  useEffect(() => {
    if (shouldHydratePreviewPanel) return;
    setPreviewData(null);
  }, [setPreviewData, shouldHydratePreviewPanel]);

  useEffect(() => {
    return () => {
      setPreviewData(null);
      if (welcomeChatRetryTimeoutRef.current !== null) {
        globalThis.clearTimeout(welcomeChatRetryTimeoutRef.current);
      }
    };
  }, [setPreviewData]);

  useEffect(() => {
    if (needsOnboarding && !selectedProfile && !dashboardLoadError) {
      router.replace(APP_ROUTES.ONBOARDING);
    }
  }, [dashboardLoadError, needsOnboarding, router, selectedProfile]);

  // Fetch social links for the selected profile
  const profileId = shouldHydratePreviewPanel ? (activeProfile?.id ?? '') : '';
  const { data: socialLinks } = useDashboardSocialLinksQuery(profileId);

  useEffect(() => {
    if (!shouldHydratePreviewPanel || !fromOnboarding) return;

    try {
      const rawSnapshot = globalThis.sessionStorage?.getItem(
        ONBOARDING_PREVIEW_SNAPSHOT_KEY
      );
      if (!rawSnapshot) return;

      const snapshot = JSON.parse(rawSnapshot) as Parameters<
        typeof setPreviewData
      >[0];
      setPreviewData(snapshot);
    } catch {
      // sessionStorage may be unavailable or the payload may be malformed
    }
  }, [fromOnboarding, setPreviewData, shouldHydratePreviewPanel]);

  // Convert API links to preview panel format
  const previewLinks: PreviewPanelLink[] = useMemo(
    () =>
      (socialLinks ?? []).map(link => ({
        id: link.id,
        title: link.platform,
        url: link.url,
        platform: link.platform,
        isVisible: true,
      })),
    [socialLinks]
  );

  // Hydrate preview panel with profile data and links
  useEffect(() => {
    if (!shouldHydratePreviewPanel || !activeProfile) return;
    const profileSettings = activeProfile.settings as Record<
      string,
      unknown
    > | null;
    setPreviewData({
      username: activeProfile.username,
      displayName: activeProfile.displayName ?? activeProfile.username,
      avatarUrl: activeProfile.avatarUrl ?? null,
      bio: activeProfile.bio ?? null,
      genres: activeProfile.genres ?? null,
      location: activeProfile.location ?? null,
      hometown:
        getHometownFromSettings(
          activeProfile.settings as Record<string, unknown> | null
        ) ?? null,
      activeSinceYear: activeProfile.activeSinceYear ?? null,
      links: previewLinks,
      profilePath: `/${activeProfile.username}`,
      dspConnections: {
        spotify: {
          connected: Boolean(activeProfile.spotifyId),
          artistName:
            (profileSettings?.spotifyArtistName as string | null) ?? null,
        },
        appleMusic: {
          connected: Boolean(activeProfile.appleMusicId),
          artistName:
            (profileSettings?.appleMusicArtistName as string | null) ?? null,
        },
      },
    });
  }, [activeProfile, previewLinks, setPreviewData, shouldHydratePreviewPanel]);

  const { copy: copySessionId, isSuccess: sessionIdCopied } = useClipboard({
    onSuccess: () => notifications.success('Session ID copied'),
    onError: () => notifications.error('Could not copy session ID'),
  });

  const deleteConversation = useDeleteConversationMutation();

  const handleCopyConversationId = useCallback(async () => {
    if (!conversationId) {
      notifications.error(
        'Session ID is only available after your first message.'
      );
      return;
    }
    copySessionId(conversationId);
  }, [conversationId, notifications, copySessionId]);

  const handleArchive = useCallback(async () => {
    if (!conversationId) return;
    await deleteConversation.mutateAsync({ conversationId });
    router.push(APP_ROUTES.CHAT);
    notifications.success('Thread archived');
  }, [conversationId, deleteConversation, router, notifications]);

  const headerActions = useMemo(() => {
    if (!conversationId) {
      return null;
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            className={DRAWER_HEADER_ICON_BUTTON_CLASSNAME}
            aria-label='Thread options'
          >
            <Ellipsis aria-hidden='true' className='size-4' />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={handleCopyConversationId}>
            {sessionIdCopied ? (
              <Check aria-hidden='true' className='size-3.5' />
            ) : (
              <Copy aria-hidden='true' className='size-3.5' />
            )}
            {sessionIdCopied ? 'Copied!' : 'Copy Session ID'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleArchive}>
            <Archive aria-hidden='true' className='size-3.5' />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }, [
    conversationId,
    sessionIdCopied,
    handleCopyConversationId,
    handleArchive,
  ]);

  const handleConversationCreate = useCallback(
    (newConversationId: string) => {
      router.replace(`${APP_ROUTES.CHAT}/${newConversationId}`, {
        scroll: false,
      });
    },
    [router]
  );

  // Update the header badge when the conversation title changes
  const handleTitleChange = useCallback(
    (title: string | null) => {
      if (title) {
        setHeaderBadge(<ChatTitleBadge title={title} />);
      } else {
        setHeaderBadge(null);
      }
    },
    [setHeaderBadge]
  );

  // Clean up header badge when leaving the chat page
  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderBadge, setHeaderActions]);

  const rawQuery = useMemo(() => searchParams.get('q'), [searchParams]);

  // Auto-open the profile drawer when redirected from /dashboard/profile (?panel=profile)
  useEffect(() => {
    if (!enablePreviewPanel) return;
    if (panelParam === 'profile') {
      openPreviewPanel();
    }
  }, [enablePreviewPanel, openPreviewPanel, panelParam]);

  // Pick up ?q= param (e.g. from profile page chat fallback) and pre-fill the input.
  // We pass it as initialQuery so JovieChat can auto-submit it.
  const initialQuery =
    !env.IS_E2E && !initialQueryHandled && !conversationId ? rawQuery : null;

  // Mark as handled after first render so re-renders don't re-submit
  useEffect(() => {
    if (rawQuery && !conversationId) {
      setInitialQueryHandled(true);
    }
  }, [rawQuery, conversationId]);

  useEffect(() => {
    if (
      !fromOnboarding ||
      conversationId ||
      !activeProfile ||
      welcomeChatBootstrapStateRef.current !== 'idle'
    ) {
      return;
    }

    let isActive = true;
    let controller: AbortController | null = null;

    const clearRetryTimeout = () => {
      if (welcomeChatRetryTimeoutRef.current !== null) {
        globalThis.clearTimeout(welcomeChatRetryTimeoutRef.current);
        welcomeChatRetryTimeoutRef.current = null;
      }
    };

    const bootstrapWelcomeChat = async () => {
      if (!isActive || welcomeChatBootstrapStateRef.current !== 'idle') {
        return;
      }

      controller?.abort();
      controller = new AbortController();
      setWelcomeChatBootstrapStatus('pending');

      let initialReply = '';
      try {
        initialReply =
          globalThis.sessionStorage?.getItem(ONBOARDING_WELCOME_REPLY_KEY) ??
          '';
      } catch {
        initialReply = '';
      }

      const response = await fetch('/api/onboarding/welcome-chat', {
        body: JSON.stringify({ initialReply }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });

      if (!response.ok) {
        if (!controller.signal.aborted && isActive) {
          scheduleRetry(response.status);
        }
        return;
      }

      const payload = (await response.json()) as {
        route?: string;
      };
      welcomeChatRetryCountRef.current = 0;
      setWelcomeChatBootstrapStatus('done');

      try {
        globalThis.sessionStorage?.removeItem(ONBOARDING_WELCOME_REPLY_KEY);
        globalThis.sessionStorage?.removeItem(ONBOARDING_PREVIEW_SNAPSHOT_KEY);
      } catch {
        // sessionStorage cleanup is non-critical
      }

      if (isActive && !controller.signal.aborted && payload.route) {
        router.replace(payload.route, { scroll: false });
      }
    };

    const scheduleRetry = (status: number | null) => {
      if (!isActive) {
        return;
      }

      if (
        !shouldRetryWelcomeChatBootstrap(status) ||
        welcomeChatRetryCountRef.current >=
          WELCOME_CHAT_BOOTSTRAP_RETRY_DELAYS_MS.length
      ) {
        setWelcomeChatBootstrapStatus('failed');
        notifications.error(
          'We could not start your onboarding chat. Refresh to try again.'
        );
        return;
      }

      const delay =
        WELCOME_CHAT_BOOTSTRAP_RETRY_DELAYS_MS[
          welcomeChatRetryCountRef.current
        ] ?? WELCOME_CHAT_BOOTSTRAP_RETRY_DELAYS_MS.at(-1);

      welcomeChatRetryCountRef.current += 1;
      setWelcomeChatBootstrapStatus('scheduled');
      clearRetryTimeout();
      welcomeChatRetryTimeoutRef.current = globalThis.setTimeout(() => {
        if (!isActive) {
          return;
        }

        clearRetryTimeout();
        setWelcomeChatBootstrapStatus('idle');
        attemptBootstrap();
      }, delay);
    };

    const attemptBootstrap = () => {
      bootstrapWelcomeChat().catch(() => {
        if (!controller?.signal.aborted && isActive) {
          scheduleRetry(null);
        }
      });
    };

    attemptBootstrap();

    return () => {
      isActive = false;
      controller?.abort();
      clearRetryTimeout();
      resetWelcomeChatBootstrapState(
        welcomeChatBootstrapStateRef,
        welcomeChatRetryCountRef
      );
    };
  }, [
    activeProfile,
    conversationId,
    fromOnboarding,
    notifications,
    router,
    setWelcomeChatBootstrapStatus,
  ]);

  // Profile unavailable — show actionable error instead of infinite spinner.
  // This happens when billing/entitlements fail or the DB query times out,
  // causing getDashboardData to return selectedProfile: null.
  useEffect(() => {
    if (activeProfile) {
      setAutoRetryCount(0);
      return;
    }

    const fromParam = searchParams.get('from');
    const onboardingParam = searchParams.get('onboarding');
    const wasLikelyJustOnboarded =
      fromParam === 'onboarding' || onboardingParam === 'complete';

    addBreadcrumb({
      category: 'dashboard.chat',
      level: hasDashboardLoadFailure ? 'error' : 'warning',
      message: 'ChatPageClient rendered with null selectedProfile',
      data: {
        hasDashboardLoadFailure,
        dashboardLoadError,
        needsOnboarding,
        creatorProfilesCount: creatorProfiles.length,
        hasProfilesButNoSelection,
        isProfileSetupRace,
        wasLikelyJustOnboarded,
        hasSpotifyConnectedProfile: creatorProfiles.some(profile =>
          Boolean(profile.spotifyId)
        ),
        conversationId: conversationId ?? null,
      },
    });

    if (hasDashboardLoadFailure) {
      captureMessage(
        'Chat selectedProfile missing due to dashboard load failure',
        {
          level: 'error',
          tags: {
            category: 'dashboard.chat',
            state: 'profile_load_failed',
          },
          extra: {
            dashboardLoadError,
            needsOnboarding,
            creatorProfilesCount: creatorProfiles.length,
            hasProfilesButNoSelection,
            conversationId: conversationId ?? null,
          },
        }
      );
      return;
    }

    if (!canAutoRetry) {
      return;
    }

    const retryTimeout = globalThis.setTimeout(() => {
      setAutoRetryCount(previous => previous + 1);
      router.refresh();
    }, 3000);

    return () => {
      globalThis.clearTimeout(retryTimeout);
    };
  }, [
    canAutoRetry,
    conversationId,
    creatorProfiles,
    dashboardLoadError,
    hasDashboardLoadFailure,
    hasProfilesButNoSelection,
    isProfileSetupRace,
    needsOnboarding,
    router,
    searchParams,
    activeProfile,
  ]);

  if (!activeProfile) {
    return (
      <ChatProfileFallback
        needsOnboarding={needsOnboarding}
        dashboardLoadError={dashboardLoadError}
        isProfileSetupRace={isProfileSetupRace}
        canAutoRetry={canAutoRetry}
        autoRetryCount={autoRetryCount}
        onRetry={() => router.refresh()}
      />
    );
  }

  return (
    <ChatEntityPanelProvider resetKey={conversationId ?? null}>
      <ChatEntityRightPanelHost
        enablePreviewPanel={shouldHydratePreviewPanel}
      />
      <ErrorBoundary
        fallback={
          <ChatWorkspaceSurface>
            <div className='flex h-full items-center justify-center p-6'>
              <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
                <AlertCircle className='h-8 w-8 text-tertiary-token' />
                <p className='text-sm text-secondary-token'>
                  Something went wrong loading chat. Please try again.
                </p>
                <Button
                  onClick={() => router.refresh()}
                  variant='secondary'
                  size='sm'
                  className='gap-2'
                >
                  <RefreshCw className='h-4 w-4' />
                  Retry
                </Button>
              </ContentSurfaceCard>
            </div>
          </ChatWorkspaceSurface>
        }
      >
        <ChatWorkspaceSurface>
          <JovieChat
            profileId={activeProfile.id}
            conversationId={conversationId}
            onConversationCreate={handleConversationCreate}
            onTitleChange={handleTitleChange}
            initialQuery={initialQuery ?? undefined}
            displayName={activeProfile.displayName ?? undefined}
            avatarUrl={activeProfile.avatarUrl}
            username={activeProfile.username ?? undefined}
            isFirstSession={isFirstSession || dashboardIsFirstSession || false}
          />
        </ChatWorkspaceSurface>
      </ErrorBoundary>
    </ChatEntityPanelProvider>
  );
}
