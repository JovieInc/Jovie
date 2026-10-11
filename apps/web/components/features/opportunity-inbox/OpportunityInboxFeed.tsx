'use client';

import type { RefObject } from 'react';
import { OpportunityRow } from '@/components/organisms/opportunity-card/OpportunityRow';
import type { OpportunityRowState } from '@/components/organisms/opportunity-card/types';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';
import { OpportunityCardStack } from './OpportunityCardStack';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';
import { OpportunityInboxSocialReplyCard } from './OpportunityInboxSocialReplyCard';
import { OpportunityInboxYoutubeThumbnailCard } from './OpportunityInboxYoutubeThumbnailCard';

export interface OpportunityInboxFeedProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onApprove: (id: string) => void | Promise<void>;
  readonly onDismiss: (id: string) => void | Promise<void>;
  readonly onOpen?: (id: string) => void;
  readonly onFeedback: (
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => void;
  readonly onNextStep?: (id: string) => void;
  readonly onRevise?: (id: string, comment: string) => void;
  readonly pendingActionId?: string | null;
  readonly pendingFeedbackId?: string | null;
  readonly pendingReviseId?: string | null;
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
  onRevise,
  pendingActionId = null,
  pendingFeedbackId: _pendingFeedbackId = null,
  pendingReviseId = null,
  pendingNextStepId = null,
  enableStackInteractions = false,
  stackKeyboardControlRef,
  onStackActionInitiated,
  onStackNextStep,
  className,
}: OpportunityInboxFeedProps) {
  if (enableStackInteractions) {
    const stackCards = cards.filter(
      card => card.category !== 'workflow_capture'
    );
    return (
      <div className={className}>
        <OpportunityCardStack
          cards={stackCards}
          onAccept={id => {
            onStackActionInitiated?.(id);
            const card = stackCards.find(candidate => candidate.id === id);
            if (card?.category === 'report') {
              (onStackNextStep ?? onNextStep ?? onApprove)(id);
            } else {
              void onApprove(id);
            }
          }}
          onReject={id => {
            onStackActionInitiated?.(id);
            void onDismiss(id);
          }}
          onNextStep={id => {
            (onStackNextStep ?? onNextStep ?? onApprove)(id);
          }}
          onRevise={onRevise}
          onOpen={onOpen ?? (() => undefined)}
          pendingActionId={pendingActionId}
          pendingNextStepId={pendingNextStepId}
          pendingReviseId={pendingReviseId}
          keyboardControlRef={stackKeyboardControlRef}
        />
      </div>
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
        {cards
          .filter(card => card.category !== 'workflow_capture')
          .map(card =>
            card.category === 'report' && card.report ? (
              <OpportunityInboxReportCard
                key={card.id}
                card={card}
                onNextStep={onNextStep ?? onApprove}
                onDismiss={onDismiss}
                isSubmittingNextStep={pendingNextStepId === card.id}
                isDismissing={pendingActionId === card.id}
              />
            ) : card.category === 'social_reply' && card.socialReply ? (
              <OpportunityInboxSocialReplyCard
                key={card.id}
                card={card}
                onApprove={id => void onApprove(id)}
                onDismiss={id => void onDismiss(id)}
                onRevise={onRevise ?? (() => undefined)}
                isApproving={pendingActionId === card.id}
                isDismissing={pendingActionId === card.id}
                isRevising={pendingReviseId === card.id}
              />
            ) : card.category === 'youtube_thumbnail' &&
              card.youtubeThumbnail ? (
              <OpportunityInboxYoutubeThumbnailCard
                key={card.id}
                card={card}
                onApprove={onApprove}
                onReject={onDismiss}
                isBusy={pendingActionId === card.id}
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
