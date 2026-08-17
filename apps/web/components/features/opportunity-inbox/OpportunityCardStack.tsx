'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useId,
} from 'react';
import { OpportunityRow } from '@/components/organisms/opportunity-card/OpportunityRow';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

const COMMIT_OFFSET_PX = 120;

export interface OpportunityCardStackProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onAccept: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onNextStep?: (id: string) => void;
  readonly pendingActionId?: string | null;
  readonly pendingNextStepId?: string | null;
  /** Receives focus when the parent restores context after an action. */
  readonly keyboardControlRef?: RefObject<HTMLButtonElement | null>;
  readonly className?: string;
}

/**
 * Card-stack interaction layer for the opportunity inbox (JOV-3932 / GH #13172).
 *
 * - Swipe right / ArrowRight → accept
 * - Swipe left / ArrowLeft → reject
 * - Enter on the focused keyboard control → open chat with the card pinned
 * - Visible accept/reject buttons remain alongside gesture input
 * - prefers-reduced-motion: fade out, no drag
 */
export function OpportunityCardStack({
  cards,
  onAccept,
  onReject,
  onOpen,
  onNextStep,
  pendingActionId = null,
  pendingNextStepId = null,
  keyboardControlRef,
  className,
}: OpportunityCardStackProps) {
  const reducedMotion = useReducedMotion();
  const instructionsId = useId();
  const topCard = cards[0] ?? null;
  const peekCards = cards.slice(1, 3);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!topCard) return;
      // This handler belongs to the dedicated native button. It cannot hijack
      // keyboard behavior from the visible child controls in the stack.
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        event.target !== event.currentTarget
      ) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onAccept(topCard.id);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onReject(topCard.id);
      }
    },
    [onAccept, onReject, topCard]
  );

  if (!topCard) {
    return null;
  }

  return (
    <section
      className={cn('relative', className)}
      data-testid='opportunity-card-stack'
      aria-label='Opportunity Card Stack'
    >
      <button
        type='button'
        ref={keyboardControlRef}
        className='sr-only focus-visible:absolute focus-visible:top-0 focus-visible:left-0 focus-visible:z-20 focus-visible:not-sr-only focus-visible:rounded-sm focus-visible:bg-surface-1 focus-visible:px-2 focus-visible:py-1 focus-visible:text-2xs focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface)'
        aria-describedby={instructionsId}
        onClick={() => onOpen(topCard.id)}
        onKeyDown={handleKeyDown}
      >
        Review Current Opportunity
      </button>
      <div className='system-b-opportunity-inbox-section-label'>Today</div>

      {/* Peek stack behind the top card */}
      <div className='relative min-h-20'>
        {peekCards.map((card, index) => (
          <ul
            key={card.id}
            aria-hidden='true'
            inert
            className='pointer-events-none absolute inset-x-0 top-0 m-0 list-none p-0 opacity-40'
            data-testid={`opportunity-stack-peek-${card.id}`}
            style={{
              transform: `translateY(${(index + 1) * 6}px) scale(${1 - (index + 1) * 0.02})`,
              zIndex: peekCards.length - index,
            }}
          >
            <OpportunityRow
              id={card.id}
              state='new'
              title={card.title}
              metadata={card.why}
              hideDot={false}
            />
          </ul>
        ))}

        <AnimatePresence mode='popLayout'>
          <motion.div
            key={topCard.id}
            className='relative z-10'
            drag={reducedMotion ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.85}
            onDragEnd={(_event, info) => {
              if (info.offset.x > COMMIT_OFFSET_PX) {
                onAccept(topCard.id);
              } else if (info.offset.x < -COMMIT_OFFSET_PX) {
                onReject(topCard.id);
              }
            }}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, transform: 'translateY(8px) scale(0.98)' }
            }
            animate={{ opacity: 1, transform: 'translateY(0) scale(1)' }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, transform: 'translateX(0) scale(0.96)' }
            }
            transition={{
              duration: reducedMotion ? 0.15 : 0.22,
              ease: 'easeOut',
            }}
            style={{ touchAction: 'pan-y' }}
          >
            {topCard.category === 'report' && topCard.report ? (
              <OpportunityInboxReportCard
                card={topCard}
                onNextStep={onNextStep ?? onAccept}
                onDismiss={onReject}
                isSubmittingNextStep={pendingNextStepId === topCard.id}
                isDismissing={pendingActionId === topCard.id}
              />
            ) : (
              <ul className='m-0 list-none p-0'>
                <OpportunityRow
                  id={topCard.id}
                  state='new'
                  title={topCard.title}
                  metadata={topCard.why}
                  hideDot={false}
                  primaryActionLabel={topCard.primaryActionLabel}
                  onPrimaryAction={id => {
                    // Primary pill accepts; open is Enter/tap via stack focus.
                    onAccept(id);
                  }}
                  onDismiss={id => {
                    onReject(id);
                  }}
                  isBusy={pendingActionId === topCard.id}
                  dataTestId={`opportunity-stack-top-${topCard.id}`}
                />
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p id={instructionsId} className='mt-3 text-2xs text-quaternary-token'>
        Swipe right to accept, left to dismiss. From the current opportunity
        keyboard control, arrow keys act and Enter opens chat.
      </p>
    </section>
  );
}
