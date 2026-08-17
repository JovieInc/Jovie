'use client';

import type { RefObject } from 'react';
import { OpportunityRow } from '@/components/organisms/opportunity-card/OpportunityRow';
import type { OpportunityRowState } from '@/components/organisms/opportunity-card/types';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';
import { OpportunityCardStack } from './OpportunityCardStack';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

export interface OpportunityInboxFeedProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onApprove: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onOpen?: (id: string) => void;
  readonly onFeedback: (
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => void;
  readonly onNextStep?: (id: string) => void;
  readonly pendingActionId?: string | null;
  readonly pendingFeedbackId?: string | null;
  readonly pendingNextStepId?: string | null;
  /** When true, render the swipe/keyboard card stack (JOV-3932). */
  readonly enableStackInteractions?: boolean;
  /** Restores focus to the current stack control after a stack action. */
  readonly stackKeyboardControlRef?: RefObject<HTMLButtonElement | null>;
  /** Marks that a stack action may require parent-level focus recovery. */
  readonly onStackActionInitiated?: (id: string) => void;
  /** Queues a report next step and restores focus only after it succeeds. */
  readonly onStackNextStep?: (id: string) => void;
  readonly className?: string;
}

/**
 * Map the existing OpportunityInboxCardViewModel status to the new
 * OpportunityRowState. The current data model only exposes 'pending',
 * but the new row component supports all 5 states for progressive design.
 */
function mapCardState(_status: string): OpportunityRowState {
  // Cards visible in the feed are always actionable — map to 'new'
  return 'new';
}

export function OpportunityInboxFeed({
  cards,
  onApprove,
  onDismiss,
  onOpen,
  onFeedback: _onFeedback,
  onNextStep,
  pendingActionId = null,
  pendingFeedbackId: _pendingFeedbackId = null,
  pendingNextStepId = null,
  enableStackInteractions = false,
  stackKeyboardControlRef,
  onStackActionInitiated,
  onStackNextStep,
  className,
}: OpportunityInboxFeedProps) {
  if (enableStackInteractions) {
    return (
      <OpportunityCardStack
        cards={cards}
        onAccept={id => {
          onStackActionInitiated?.(id);
          onApprove(id);
        }}
        onReject={id => {
          onStackActionInitiated?.(id);
          onDismiss(id);
        }}
        onOpen={onOpen ?? onApprove}
        onNextStep={onStackNextStep ?? onNextStep ?? onApprove}
        pendingActionId={pendingActionId}
        pendingNextStepId={pendingNextStepId}
        keyboardControlRef={stackKeyboardControlRef}
        className={className}
      />
    );
  }

  return (
    <section
      className={cn('system-b-opportunity-inbox-feed', className)}
      data-testid='opportunity-inbox-feed'
      aria-label='Opportunity Inbox Feed'
    >
      <div className='system-b-opportunity-inbox-section-label'>Today</div>
      <div className='system-b-opportunity-inbox-feed-list'>
        {cards.map(card =>
          card.category === 'report' && card.report ? (
            <OpportunityInboxReportCard
              key={card.id}
              card={card}
              onNextStep={onNextStep ?? onApprove}
              onDismiss={onDismiss}
              isSubmittingNextStep={pendingNextStepId === card.id}
              isDismissing={pendingActionId === card.id}
            />
          ) : (
            <OpportunityRow
              key={card.id}
              id={card.id}
              state={mapCardState(card.status)}
              title={card.title}
              metadata={card.why}
              hideDot={false}
              primaryActionLabel={
                card.category === 'brand_deal'
                  ? card.primaryActionLabel
                  : undefined
              }
              onPrimaryAction={id => onApprove(id)}
              onDismiss={id => onDismiss(id)}
              isBusy={pendingActionId === card.id}
            />
          )
        )}
      </div>
    </section>
  );
}
