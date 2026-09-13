'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { FounderReviewRecorder } from '@/components/features/opportunity-inbox/FounderReviewRecorder';
import { FounderReviewStack } from '@/components/features/opportunity-inbox/FounderReviewStack';
import { APP_ROUTES } from '@/constants/routes';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { useOpportunityInboxMutations } from '@/lib/queries/useOpportunityInboxMutations';

type FounderReviewCard = OpportunityInboxCardViewModel & {
  readonly sourceKind: string;
};

function isFounderReviewCard(
  card: OpportunityInboxCardViewModel
): card is FounderReviewCard {
  return card.category !== 'workflow_capture' && Boolean(card.sourceKind);
}

export interface OvieFounderReviewSurfaceProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  /** True when the server could not load the queue; keep this distinct from empty. */
  readonly loadError?: boolean;
}

/**
 * Ovie-owned home for the founder recorder and durable inbox review actions.
 * The customer shell never mounts this surface; its APIs are independently
 * admin-gated as well.
 */
export function OvieFounderReviewSurface({
  cards: initialCards,
  loadError = false,
}: OvieFounderReviewSurfaceProps) {
  const router = useRouter();
  const [cards, setCards] = useState(() =>
    initialCards.filter(isFounderReviewCard)
  );
  const { approveMutation, dismissMutation, nextStepMutation } =
    useOpportunityInboxMutations();

  const applyAction = useCallback(
    async (id: string, action: 'approve' | 'dismiss' | 'next-step') => {
      const card = cards.find(candidate => candidate.id === id);
      if (!card) return;
      setCards(current => current.filter(candidate => candidate.id !== id));
      try {
        if (action === 'approve') {
          await approveMutation.mutateAsync(id);
        } else if (action === 'dismiss') {
          await dismissMutation.mutateAsync(id);
        } else {
          await nextStepMutation.mutateAsync(id);
        }
      } catch (error) {
        setCards(current => [card, ...current]);
        throw error;
      }
    },
    [approveMutation, cards, dismissMutation, nextStepMutation]
  );

  const handleApprove = useCallback(
    (id: string) => {
      const card = cards.find(candidate => candidate.id === id);
      return applyAction(
        id,
        card?.category === 'report' ? 'next-step' : 'approve'
      );
    },
    [applyAction, cards]
  );
  const handleDismiss = useCallback(
    (id: string) => applyAction(id, 'dismiss'),
    [applyAction]
  );
  const handleOpen = useCallback(
    (id: string) => {
      router.push(
        `${APP_ROUTES.ADMIN_CHAT}?opportunityId=${encodeURIComponent(id)}`
      );
    },
    [router]
  );

  const pendingActionId = useMemo(() => {
    if (approveMutation.isPending) return approveMutation.variables ?? null;
    if (dismissMutation.isPending) return dismissMutation.variables ?? null;
    if (nextStepMutation.isPending) return nextStepMutation.variables ?? null;
    return null;
  }, [
    approveMutation.isPending,
    approveMutation.variables,
    dismissMutation.isPending,
    dismissMutation.variables,
    nextStepMutation.isPending,
    nextStepMutation.variables,
  ]);

  return (
    <section
      className='space-y-4 rounded-lg border border-subtle bg-surface-0 p-4 sm:p-5'
      data-testid='ovie-founder-review-entry'
      aria-labelledby='ovie-founder-review-title'
    >
      <div>
        <p className='text-2xs font-medium text-tertiary-token'>
          Founder review
        </p>
        <h2
          id='ovie-founder-review-title'
          className='mt-2 text-xl font-semibold tracking-tight text-primary-token'
        >
          Capture A Founder Note
        </h2>
        <p className='mt-2 max-w-xl text-sm leading-6 text-secondary-token'>
          Ovie is the authorized home for founder capture. Save a typed or
          recorded note here; the receipt stays private and never grants
          permission to publish or take an external action.
        </p>
      </div>

      {loadError ? (
        <p
          className='rounded-md border border-error/20 bg-error-subtle px-3 py-2 text-sm text-error'
          data-testid='ovie-founder-review-load-error'
          role='alert'
        >
          Founder review queue unavailable. Refresh to retry. New founder notes
          can still be saved below.
        </p>
      ) : cards.length > 0 ? (
        <FounderReviewStack
          cards={cards}
          onApprove={handleApprove}
          onReject={handleDismiss}
          onOpen={handleOpen}
          pendingActionId={pendingActionId}
        />
      ) : (
        <p className='rounded-md border border-subtle bg-surface-1 px-3 py-2 text-sm text-secondary-token'>
          No pending inbox opportunities. New founder notes can still be saved
          below.
        </p>
      )}

      <FounderReviewRecorder
        className='mt-4'
        target={{
          type: 'founder-note',
          id: 'founder-brain-dump',
          title: 'Inbox Brain Dump',
          sourceKind: 'founder.brain_dump',
          category: 'note',
        }}
      />
    </section>
  );
}
