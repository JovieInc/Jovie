'use client';

import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { OpportunityInboxData } from '@/lib/connectors/opportunity-inbox-types';
import { useOpportunityInboxMutations } from '@/lib/queries/useOpportunityInboxMutations';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

export interface OpportunityInboxPageClientProps {
  readonly inbox: OpportunityInboxData;
}

export function OpportunityInboxPageClient({
  inbox,
}: OpportunityInboxPageClientProps) {
  const pathname = usePathname();
  const [cards, setCards] = useState(inbox.cards);
  const { approveMutation, dismissMutation, feedbackMutation } =
    useOpportunityInboxMutations();

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

  return (
    <div
      className='system-b-opportunity-inbox-page'
      data-testid='opportunity-inbox-page'
    >
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

      {cards.length > 0 ? (
        <OpportunityInboxFeed
          cards={cards}
          onApprove={handleApprove}
          onDismiss={handleDismiss}
          onFeedback={handleFeedback}
          pendingActionId={pendingActionId}
          pendingFeedbackId={pendingFeedbackId}
        />
      ) : (
        <OpportunityInboxEmptyState actionCards={inbox.emptyActionCards} />
      )}
    </div>
  );
}
