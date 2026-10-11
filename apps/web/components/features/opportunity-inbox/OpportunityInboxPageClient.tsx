'use client';

import { Button } from '@jovie/ui';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { JovieWorkFeed } from '@/components/features/dashboard/organisms/jovie-work-feed/JovieWorkFeed';
import { ErrorBanner } from '@/components/features/feedback/ErrorBanner';
import { PageShell } from '@/components/organisms/PageShell';
import { useRuntimeUpdate } from '@/components/shell/RuntimeUpdateProvider';
import { APP_ROUTES } from '@/constants/routes';
import {
  OPPORTUNITY_SIGNAL_TYPE_META,
  type OpportunitySignalType,
} from '@/lib/connectors/opportunity-inbox-signal-type';
import {
  EMPTY_OPPORTUNITY_INBOX_TOUR_DATES,
  type OpportunityInboxData,
  type OpportunityInboxTourDateItem,
} from '@/lib/connectors/opportunity-inbox-types';
import type { AvailableDSP } from '@/lib/dsp';
import { useAppFlag } from '@/lib/flags/client';
import { useOpportunityInboxMutations } from '@/lib/queries/useOpportunityInboxMutations';
import { useTourDateReviewMutations } from '@/lib/queries/useTourDateReviewMutations';
import { cn } from '@/lib/utils';
import { getRovingFocusIndex } from '@/lib/utils/keyboard';
import { InboxRuntimeNotification } from './InboxRuntimeNotification';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';
import {
  OpportunityInboxConfirmedTourDates,
  OpportunityInboxRejectedTourDates,
} from './OpportunityInboxTourDateSections';

const PreviewDataHydrator = dynamic(
  () =>
    import('@/features/dashboard/organisms/PreviewDataHydrator').then(mod => ({
      default: mod.PreviewDataHydrator,
    })),
  { ssr: false }
);

function HomeRightPanelHost({
  connectedDSPs,
  initialLinks,
}: Readonly<{
  connectedDSPs: readonly AvailableDSP[];
  initialLinks: readonly ProfileSocialLink[];
}>) {
  return (
    <PreviewDataHydrator
      connectedDSPs={connectedDSPs}
      initialLinks={[...initialLinks]}
    />
  );
}

export interface OpportunityInboxPageClientProps {
  readonly inbox: OpportunityInboxData;
  readonly profileId?: string | null;
  readonly initialView?: 'needs' | 'done';
  readonly connectedDSPs?: readonly AvailableDSP[];
  readonly initialLinks?: readonly ProfileSocialLink[];
}

type SignalTypeFilter = OpportunitySignalType | 'all';

const SIGNAL_TYPE_FILTERS: readonly {
  readonly value: SignalTypeFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  {
    value: 'new_song',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_song.filterLabel,
  },
  {
    value: 'new_event',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_event.filterLabel,
  },
  {
    value: 'new_profile_match',
    label: OPPORTUNITY_SIGNAL_TYPE_META.new_profile_match.filterLabel,
  },
  {
    value: 'brand_deal',
    label: OPPORTUNITY_SIGNAL_TYPE_META.brand_deal.filterLabel,
  },
  {
    value: 'fan_reply',
    label: OPPORTUNITY_SIGNAL_TYPE_META.fan_reply.filterLabel,
  },
];

function sortByStartDate(
  items: readonly OpportunityInboxTourDateItem[]
): OpportunityInboxTourDateItem[] {
  return [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function OpportunityInboxPageClient({
  inbox,
  profileId = null,
  initialView = 'needs',
  connectedDSPs = [],
  initialLinks = [],
}: OpportunityInboxPageClientProps) {
  const [inboxView, setInboxView] = useState(initialView);
  useEffect(() => setInboxView(initialView), [initialView]);
  const runtimeUpdate = useRuntimeUpdate();
  const inboxPageRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const inboxHomeEnabled = useAppFlag('INBOX_HOME');
  const [cards, setCards] = useState(inbox.cards);
  const [isRefreshing, startRefresh] = useTransition();
  const retryFocusRecoveryRef = useRef(false);
  const inboxReadUnavailable =
    inbox.availability?.suggestedActions !== 'available' ||
    !['available', 'not_requested'].includes(
      inbox.availability?.tourDates ?? 'unknown'
    );
  const [signalTypeFilter, setSignalTypeFilter] =
    useState<SignalTypeFilter>('all');
  const [signalFilterFocusIndex, setSignalFilterFocusIndex] = useState(0);
  const signalFilterRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stackKeyboardControlRef = useRef<HTMLButtonElement | null>(null);
  const stackActionNeedsFocusRecoveryRef = useRef<string | null>(null);
  const latestStackActionIdRef = useRef<string | null>(null);
  const [stackFocusRecoveryVersion, setStackFocusRecoveryVersion] = useState(0);
  const initialTourDates =
    inbox.tourDates ?? EMPTY_OPPORTUNITY_INBOX_TOUR_DATES;
  const [pendingTourDates, setPendingTourDates] = useState(
    initialTourDates.pending
  );
  const [confirmedTourDates, setConfirmedTourDates] = useState(
    initialTourDates.confirmed
  );
  const [rejectedTourDates, setRejectedTourDates] = useState(
    initialTourDates.rejected
  );
  // RSC refresh supplies a new authoritative snapshot while retaining local
  // filter/scroll state and the existing optimistic action handlers.
  useEffect(() => setCards(inbox.cards), [inbox.cards]);
  useEffect(() => {
    setPendingTourDates(initialTourDates.pending);
    setConfirmedTourDates(initialTourDates.confirmed);
    setRejectedTourDates(initialTourDates.rejected);
  }, [initialTourDates]);
  useEffect(() => {
    if (
      inboxReadUnavailable ||
      !retryFocusRecoveryRef.current ||
      cards !== inbox.cards ||
      pendingTourDates !== initialTourDates.pending
    )
      return;
    retryFocusRecoveryRef.current = false;
    (
      signalFilterRefs.current[signalFilterFocusIndex] ??
      inboxPageRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href]'
      )
    )?.focus();
  }, [
    cards,
    inbox.cards,
    inboxReadUnavailable,
    initialTourDates.pending,
    pendingTourDates,
    signalFilterFocusIndex,
  ]);
  const visibleCards = useMemo(
    () =>
      signalTypeFilter === 'all'
        ? cards
        : cards.filter(card => card.signalType === signalTypeFilter),
    [cards, signalTypeFilter]
  );

  const {
    approveMutation,
    dismissMutation,
    feedbackMutation,
    reviseMutation,
    nextStepMutation,
  } = useOpportunityInboxMutations();
  const { confirmMutation, rejectMutation, undoRejectMutation } =
    useTourDateReviewMutations();

  const pendingActionId = useMemo(() => {
    if (approveMutation.isPending) {
      return approveMutation.variables ?? null;
    }
    if (dismissMutation.isPending) {
      return dismissMutation.variables ?? null;
    }
    return null;
  }, [
    approveMutation.isPending,
    approveMutation.variables,
    dismissMutation.isPending,
    dismissMutation.variables,
  ]);

  const pendingFeedbackId = feedbackMutation.isPending
    ? (feedbackMutation.variables?.suggestedActionId ?? null)
    : null;

  const pendingReviseId = reviseMutation.isPending
    ? (reviseMutation.variables?.id ?? null)
    : null;

  const pendingNextStepId = nextStepMutation.isPending
    ? (nextStepMutation.variables ?? null)
    : null;

  const pendingTourDateActionId = useMemo(() => {
    if (confirmMutation.isPending) {
      return confirmMutation.variables ?? null;
    }
    if (rejectMutation.isPending) {
      return rejectMutation.variables ?? null;
    }
    return null;
  }, [
    confirmMutation.isPending,
    confirmMutation.variables,
    rejectMutation.isPending,
    rejectMutation.variables,
  ]);

  const pendingUndoId = undoRejectMutation.isPending
    ? (undoRejectMutation.variables ?? null)
    : null;

  const scheduleStackFocusRecovery = useCallback((id: string) => {
    if (latestStackActionIdRef.current !== id) return;
    stackActionNeedsFocusRecoveryRef.current = id;
    setStackFocusRecoveryVersion(version => version + 1);
  }, []);

  const beginStackAction = useCallback(
    (id: string) => {
      latestStackActionIdRef.current = id;
      scheduleStackFocusRecovery(id);
    },
    [scheduleStackFocusRecovery]
  );

  const handleApprove = useCallback(
    (id: string) => {
      const card = cards.find(candidate => candidate.id === id);
      // Optimistic remove; restore on failure (JOV-3932).
      setCards(current => current.filter(c => c.id !== id));
      approveMutation.mutate(id, {
        onError: () => {
          if (card) {
            setCards(current => [card, ...current]);
          }
          scheduleStackFocusRecovery(id);
        },
      });
    },
    [approveMutation, cards, scheduleStackFocusRecovery]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      const card = cards.find(candidate => candidate.id === id);
      setCards(current => current.filter(c => c.id !== id));
      dismissMutation.mutate(id, {
        onError: () => {
          if (card) {
            setCards(current => [card, ...current]);
          }
          scheduleStackFocusRecovery(id);
        },
      });
    },
    [cards, dismissMutation, scheduleStackFocusRecovery]
  );

  /**
   * Comment-for-revision (JOV-5128): preserve the draft until committed; the
   * server writes a new pending draft carrying the feedback history.
   */
  const handleRevise = useCallback(
    (id: string, comment: string) => {
      reviseMutation.mutate(
        { id, comment },
        {
          onSuccess: () => {
            beginStackAction(id);
            setCards(current =>
              current.filter(candidate => candidate.id !== id)
            );
          },
        }
      );
    },
    [beginStackAction, reviseMutation]
  );

  /** Open chat with the card pinned (JOV-3932/3933). */
  const handleOpen = useCallback(
    (id: string) => {
      router.push(`${APP_ROUTES.CHAT}?opportunityId=${encodeURIComponent(id)}`);
    },
    [router]
  );

  const handleFeedback = (
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => {
    feedbackMutation.mutate({
      suggestedActionId: id,
      rating,
      comment,
      pathname,
    });
  };

  const runNextStep = useCallback(
    (id: string, onSuccess?: () => void) => {
      nextStepMutation.mutate(id, {
        onSuccess: () => {
          onSuccess?.();
          setCards(current => current.filter(card => card.id !== id));
        },
      });
    },
    [nextStepMutation]
  );

  const handleNextStep = useCallback(
    (id: string) => runNextStep(id),
    [runNextStep]
  );

  const handleStackNextStep = useCallback(
    (id: string) => {
      latestStackActionIdRef.current = id;
      runNextStep(id, () => {
        scheduleStackFocusRecovery(id);
      });
    },
    [runNextStep, scheduleStackFocusRecovery]
  );

  const handleConfirmTourDate = (id: string) => {
    const item = pendingTourDates.find(candidate => candidate.id === id);
    confirmMutation.mutate(id, {
      onSuccess: () => {
        setPendingTourDates(current =>
          current.filter(candidate => candidate.id !== id)
        );
        if (item) {
          setConfirmedTourDates(current =>
            sortByStartDate([...current, { ...item, status: 'confirmed' }])
          );
        }
      },
    });
  };

  const handleRejectTourDate = (id: string) => {
    const item = pendingTourDates.find(candidate => candidate.id === id);
    rejectMutation.mutate(id, {
      onSuccess: () => {
        setPendingTourDates(current =>
          current.filter(candidate => candidate.id !== id)
        );
        if (item) {
          setRejectedTourDates(current => [
            { ...item, status: 'rejected' },
            ...current,
          ]);
        }
      },
    });
  };

  const handleUndoRejectTourDate = (id: string) => {
    const item = rejectedTourDates.find(candidate => candidate.id === id);
    undoRejectMutation.mutate(id, {
      onSuccess: () => {
        setRejectedTourDates(current =>
          current.filter(candidate => candidate.id !== id)
        );
        if (item) {
          setPendingTourDates(current =>
            sortByStartDate([...current, { ...item, status: 'pending' }])
          );
        }
      },
    });
  };

  const selectSignalTypeFilter = useCallback(
    (filter: SignalTypeFilter, focusIndex: number) => {
      setSignalTypeFilter(filter);
      setSignalFilterFocusIndex(focusIndex);
    },
    []
  );

  const handleSignalFilterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const nextIndex = getRovingFocusIndex(
        event.key,
        currentIndex,
        SIGNAL_TYPE_FILTERS.length
      );
      if (nextIndex === null) return;

      event.preventDefault();
      setSignalFilterFocusIndex(nextIndex);
      signalFilterRefs.current[nextIndex]?.focus();
    },
    []
  );

  const selectInboxView = (view: 'needs' | 'done') => {
    setInboxView(view);
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    if (view === 'done') params.set('view', 'done');
    else params.delete('view');
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`, {
      scroll: false,
    });
  };

  const hasReviewableItems = cards.length > 0 || pendingTourDates.length > 0;

  useEffect(() => {
    if (stackActionNeedsFocusRecoveryRef.current === null) return;

    const recoveryTarget =
      stackKeyboardControlRef.current ??
      signalFilterRefs.current[signalFilterFocusIndex] ??
      inboxPageRef.current?.querySelector<HTMLElement>(
        '[data-testid="opportunity-inbox-tour-date-review"] button, [data-testid="inbox-runtime-notification"] button:not(:disabled), [data-testid="opportunity-inbox-empty-state"] a, [data-testid="opportunity-inbox-empty-state"] button, [data-testid="opportunity-inbox-availability"] button'
      );

    recoveryTarget?.focus();
    stackActionNeedsFocusRecoveryRef.current = null;
  }, [
    cards.length,
    hasReviewableItems,
    pendingTourDates.length,
    signalFilterFocusIndex,
    stackFocusRecoveryVersion,
    visibleCards.length,
  ]);

  return (
    <PageShell
      frame='content-container'
      contentPadding='none'
      data-testid='opportunity-inbox-page'
    >
      <NavigationDestinationReady destination='inbox' />
      <HomeRightPanelHost
        connectedDSPs={connectedDSPs}
        initialLinks={initialLinks}
      />
      <div className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden'>
        <div
          ref={inboxPageRef}
          className='system-b-opportunity-inbox-page'
          data-testid='opportunity-inbox-content'
        >
          <div
            className='mb-4 flex min-h-7 items-center gap-1'
            role='toolbar'
            aria-label='Inbox View'
          >
            <Button
              size='sm'
              variant={inboxView === 'needs' ? 'secondary' : 'ghost'}
              aria-pressed={inboxView === 'needs'}
              onClick={() => selectInboxView('needs')}
            >
              Needs You
            </Button>
            <Button
              size='sm'
              variant={inboxView === 'done' ? 'secondary' : 'ghost'}
              aria-pressed={inboxView === 'done'}
              onClick={() => selectInboxView('done')}
            >
              Done For You
            </Button>
          </div>
          {inboxView === 'done' ? (
            profileId ? (
              <JovieWorkFeed
                profileId={profileId}
                range='30d'
                showHeader={false}
                completedOnly
              />
            ) : (
              <p
                role='status'
                className='min-h-45 text-sm text-secondary-token'
              >
                Select a profile to see completed work.
              </p>
            )
          ) : null}
          <div hidden={inboxView !== 'needs'}>
            <InboxRuntimeNotification />
            {pendingTourDates.length > 0 ? (
              <section
                className='system-b-opportunity-inbox-feed'
                data-testid='opportunity-inbox-tour-date-review'
                aria-label='Tour Dates To Review'
              >
                <div className='system-b-opportunity-inbox-section-label'>
                  Tour Dates To Review
                </div>
                <div className='system-b-opportunity-inbox-feed-list'>
                  {pendingTourDates.map(item => (
                    <OpportunityInboxTourDateRow
                      key={item.id}
                      item={item}
                      onConfirm={handleConfirmTourDate}
                      onReject={handleRejectTourDate}
                      isBusy={pendingTourDateActionId === item.id}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {cards.length > 0 ? (
              <div
                className='mb-4 flex flex-wrap items-center gap-1.5'
                role='toolbar'
                aria-label='Filter Signals By Type'
                data-testid='opportunity-inbox-signal-filters'
              >
                {SIGNAL_TYPE_FILTERS.map((filter, index) => {
                  const isActive = signalTypeFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type='button'
                      aria-pressed={isActive}
                      tabIndex={signalFilterFocusIndex === index ? 0 : -1}
                      data-testid={`opportunity-inbox-filter-${filter.value}`}
                      ref={node => {
                        signalFilterRefs.current[index] = node;
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        isActive
                          ? 'border-subtle bg-surface-1 text-primary-token'
                          : 'border-transparent text-secondary-token hover:bg-surface-1'
                      )}
                      onClick={() =>
                        selectSignalTypeFilter(filter.value, index)
                      }
                      onFocus={() => setSignalFilterFocusIndex(index)}
                      onKeyDown={event =>
                        handleSignalFilterKeyDown(event, index)
                      }
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {cards.length > 0 ? (
              visibleCards.length > 0 ? (
                <OpportunityInboxFeed
                  cards={visibleCards}
                  onApprove={handleApprove}
                  onDismiss={handleDismiss}
                  onOpen={handleOpen}
                  onFeedback={handleFeedback}
                  onNextStep={handleNextStep}
                  onRevise={handleRevise}
                  pendingActionId={pendingActionId}
                  pendingFeedbackId={pendingFeedbackId}
                  pendingReviseId={pendingReviseId}
                  pendingNextStepId={pendingNextStepId}
                  enableStackInteractions={inboxHomeEnabled}
                  stackKeyboardControlRef={stackKeyboardControlRef}
                  onStackActionInitiated={beginStackAction}
                  onStackNextStep={handleStackNextStep}
                />
              ) : (
                <p
                  className='text-secondary-token text-sm'
                  data-testid='opportunity-inbox-filter-empty'
                >
                  No pending signals of this type. Switch filters to see the
                  rest of your inbox.
                </p>
              )
            ) : null}

            {!hasReviewableItems &&
            !runtimeUpdate?.available &&
            !inboxReadUnavailable ? (
              <OpportunityInboxEmptyState
                actionCards={inbox.emptyActionCards}
              />
            ) : null}

            <OpportunityInboxConfirmedTourDates items={confirmedTourDates} />
            <OpportunityInboxRejectedTourDates
              items={rejectedTourDates}
              onUndoReject={handleUndoRejectTourDate}
              pendingUndoId={pendingUndoId}
            />
            {inboxReadUnavailable ? (
              <section
                aria-busy={isRefreshing}
                className='mt-3 min-h-24'
                data-testid='opportunity-inbox-availability'
              >
                <ErrorBanner
                  title={
                    hasReviewableItems
                      ? 'Some Opportunities Couldn’t Be Checked'
                      : 'Your Inbox Couldn’t Be Checked'
                  }
                  description={
                    isRefreshing
                      ? 'Checking your opportunities…'
                      : hasReviewableItems
                        ? 'Your loaded opportunities are still available. Try again to check for the rest.'
                        : 'We couldn’t check your opportunities. Try again to refresh your inbox.'
                  }
                  actions={[
                    {
                      label: 'Try Again',
                      onClick: () => {
                        if (isRefreshing) return;
                        retryFocusRecoveryRef.current = true;
                        startRefresh(() => router.refresh());
                      },
                    },
                  ]}
                />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
