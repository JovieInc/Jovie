'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useRef,
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
  readonly className?: string;
}

/**
 * Card-stack interaction layer for the opportunity inbox (JOV-3932 / GH #13172).
 *
 * - Swipe right / ArrowRight → accept
 * - Swipe left / ArrowLeft → reject
 * - Tap / Enter → open chat with the card pinned
 * - Visible accept/reject buttons remain for a11y (44px targets on OpportunityRow)
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
  className,
}: OpportunityCardStackProps) {
  const reducedMotion = useReducedMotion();
  const stackRef = useRef<HTMLDivElement>(null);
  const topCard = cards[0] ?? null;
  const peekCards = cards.slice(1, 3);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!topCard) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onAccept(topCard.id);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onReject(topCard.id);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onOpen(topCard.id);
      }
    },
    [onAccept, onOpen, onReject, topCard]
  );

  if (!topCard) {
    return null;
  }

  return (
    <div
      ref={stackRef}
      role='listbox'
      aria-orientation='vertical'
      className={cn('relative outline-none', className)}
      data-testid='opportunity-card-stack'
      aria-label='Opportunity Card Stack'
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className='system-b-opportunity-inbox-section-label'>Today</div>

      {/* Peek stack behind the top card */}
      <div className='relative min-h-20'>
        {peekCards.map((card, index) => (
          <div
            key={card.id}
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-0 top-0 opacity-40'
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
          </div>
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
              reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reducedMotion ? { opacity: 0 } : { opacity: 0, x: 0, scale: 0.96 }
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
              <OpportunityRow
                id={topCard.id}
                state='new'
                title={topCard.title}
                metadata={topCard.why}
                hideDot={false}
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
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <p className='mt-3 text-2xs text-quaternary-token'>
        Swipe right to accept, left to dismiss. Arrow keys when focused. Enter
        opens chat.
      </p>
    </div>
  );
}
