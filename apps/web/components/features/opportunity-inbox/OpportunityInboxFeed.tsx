'use client';

import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';
import { OpportunityInboxCard } from './OpportunityInboxCard';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

export interface OpportunityInboxFeedProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onApprove: (id: string) => void;
  readonly onDismiss: (id: string) => void;
  readonly onFeedback: (
    id: string,
    rating: 'positive' | 'negative',
    comment?: string
  ) => void;
  readonly onNextStep?: (id: string) => void;
  readonly pendingActionId?: string | null;
  readonly pendingFeedbackId?: string | null;
  readonly pendingNextStepId?: string | null;
  readonly className?: string;
}

export function OpportunityInboxFeed({
  cards,
  onApprove,
  onDismiss,
  onFeedback,
  onNextStep,
  pendingActionId = null,
  pendingFeedbackId = null,
  pendingNextStepId = null,
  className,
}: OpportunityInboxFeedProps) {
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
            <OpportunityInboxCard
              key={card.id}
              card={card}
              onApprove={onApprove}
              onDismiss={onDismiss}
              onFeedback={onFeedback}
              isApproving={pendingActionId === card.id}
              isDismissing={pendingActionId === card.id}
              isSubmittingFeedback={pendingFeedbackId === card.id}
            />
          )
        )}
      </div>
    </section>
  );
}
