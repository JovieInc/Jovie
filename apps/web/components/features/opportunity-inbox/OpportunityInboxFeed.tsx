'use client';

import type { RefObject } from 'react';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityCardStack } from './OpportunityCardStack';

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
  /** Restores focus to the current stack control after a stack action. */
  readonly stackKeyboardControlRef?: RefObject<HTMLButtonElement | null>;
  /** Marks that a stack action may require parent-level focus recovery. */
  readonly onStackActionInitiated?: (id: string) => void;
  /** Queues a report next step and restores focus only after it succeeds. */
  readonly onStackNextStep?: (id: string) => void;
  readonly className?: string;
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
  stackKeyboardControlRef,
  onStackActionInitiated,
  onStackNextStep,
  className,
}: OpportunityInboxFeedProps) {
  const stackCards = cards.filter(card => card.category !== 'workflow_capture');
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
