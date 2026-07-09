'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  OPPORTUNITY_SIGNAL_TYPE_META,
  type OpportunitySignalType,
} from '@/lib/connectors/opportunity-inbox-signal-type';
import {
  EMPTY_OPPORTUNITY_INBOX_TOUR_DATES,
  type OpportunityInboxData,
  type OpportunityInboxTourDateItem,
} from '@/lib/connectors/opportunity-inbox-types';
import { useOpportunityInboxMutations } from '@/lib/queries/useOpportunityInboxMutations';
import { useTourDateReviewMutations } from '@/lib/queries/useTourDateReviewMutations';
import { cn } from '@/lib/utils';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';
import { OpportunityInboxTourDateRow } from './OpportunityInboxTourDateRow';
import {
  OpportunityInboxConfirmedTourDates,
  OpportunityInboxRejectedTourDates,
} from './OpportunityInboxTourDateSections';

const ProfileContactSidebar = dynamic(
  () =>
    import('@/features/dashboard/organisms/profile-contact-sidebar').then(
      mod => ({ default: mod.ProfileContactSidebar })
    ),
  { ssr: false }
);

// Registers the artist-profile right rail for the dashboard home route so the
// ArtistProfileRailToggle in the shell header can animate it open/closed.
function HomeRightPanelHost() {
  const panel = useMemo(
    () => (
      <ErrorBoundary fallback={null}>
        <ProfileContactSidebar />
      </ErrorBoundary>
    ),
    []
  );
  useRegisterRightPanel(panel);
  return null;
}

export interface OpportunityInboxPageClientProps {
  readonly inbox: OpportunityInboxData;
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
];

function sortByStartDate(
  items: readonly OpportunityInboxTourDateItem[]
): OpportunityInboxTourDateItem[] {
  return [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function OpportunityInboxPageClient({
  inbox,
}: OpportunityInboxPageClientProps) {
  const pathname = usePathname();
  const [cards, setCards] = useState(inbox.cards);
  const [signalTypeFilter, setSignalTypeFilter] =
    useState<SignalTypeFilter>('all');
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

  const handleApprove = (id: string) => {
    approveMutation.mutate(id, {
      onSuccess: () => {
        setCards(current => current.filter(card => card.id !== id));
      },
    });
  };

  const handleDismiss = (id: string) => {
    dismissMutation.mutate(id, {
      onSuccess: () => {
        setCards(current => current.filter(card => card.id !== id));
      },
    });
  };

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

  const handleNextStep = (id: string) => {
    nextStepMutation.mutate(id, {
      onSuccess: () => {
        setCards(current => current.filter(card => card.id !== id));
      },
    });
  };

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

  const hasReviewableItems = cards.length > 0 || pendingTourDates.length > 0;

  return (
    <div
      className='system-b-opportunity-inbox-page'
      data-testid='opportunity-inbox-page'
    >
      <HomeRightPanelHost />
      <header className='system-b-opportunity-inbox-page-header'>
        {/* ui-casing-allow: design-locked inbox copy */}
        <h1 className='system-b-opportunity-inbox-page-title'>
          Home — the inbox
        </h1>
        <p className='system-b-opportunity-inbox-page-subtitle'>
          One feed, mixed card types — suggestion, new song, tour date, profile
          match. One interaction grammar. Empty is never blank; accents are
          reserved for state.
        </p>
      </header>

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
          role='tablist'
          aria-label='Filter Signals By Type'
          data-testid='opportunity-inbox-signal-filters'
        >
          {SIGNAL_TYPE_FILTERS.map(filter => {
            const isActive = signalTypeFilter === filter.value;
            return (
              <button
                key={filter.value}
                type='button'
                role='tab'
                aria-selected={isActive}
                data-testid={`opportunity-inbox-filter-${filter.value}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  isActive
                    ? 'border-subtle bg-surface-1 text-primary-token'
                    : 'border-transparent text-secondary-token hover:bg-surface-1'
                )}
                onClick={() => setSignalTypeFilter(filter.value)}
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
            onFeedback={handleFeedback}
            onNextStep={handleNextStep}
            pendingActionId={pendingActionId}
            pendingFeedbackId={pendingFeedbackId}
            pendingNextStepId={pendingNextStepId}
          />
        ) : (
          <p
            className='text-secondary-token text-sm'
            data-testid='opportunity-inbox-filter-empty'
          >
            No pending signals of this type. Switch filters to see the rest of
            your inbox.
          </p>
        )
      ) : null}

      {!hasReviewableItems ? (
        <OpportunityInboxEmptyState actionCards={inbox.emptyActionCards} />
      ) : null}

      <OpportunityInboxConfirmedTourDates items={confirmedTourDates} />
      <OpportunityInboxRejectedTourDates
        items={rejectedTourDates}
        onUndoReject={handleUndoRejectTourDate}
        pendingUndoId={pendingUndoId}
      />
    </div>
  );
}
