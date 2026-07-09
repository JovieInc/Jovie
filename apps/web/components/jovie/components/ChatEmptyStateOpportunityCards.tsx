'use client';

import { ArrowRight } from 'lucide-react';
import { formatOpportunityInboxRelativeTime } from '@/lib/connectors/opportunity-inbox-time';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

/**
 * Compact opportunity cards for empty-chat (GH #13177).
 * Renders up to 3 pending suggested_actions; tap enters pinned-card mode.
 *
 * Layout: fixed min-height slot per card so loading → data does not reflow
 * the centered composer stack (opacity-only reveal when ready).
 */
export interface ChatEmptyStateOpportunityCardsProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onSelect: (card: OpportunityInboxCardViewModel) => void;
  readonly className?: string;
}

const MAX_CARDS = 3;
/** Reserved height per compact card + gap — keeps empty-state geometry stable. */
const CARD_SLOT_MIN_HEIGHT_CLASS = 'min-h-[4.5rem]';

export function ChatEmptyStateOpportunityCards({
  cards,
  onSelect,
  className,
}: ChatEmptyStateOpportunityCardsProps) {
  const visible = cards.slice(0, MAX_CARDS);
  if (visible.length === 0) return null;

  return (
    <ul
      className={cn(
        'mx-auto flex w-full max-w-[28rem] list-none flex-col gap-2 p-0',
        className
      )}
      data-testid='chat-empty-state-opportunity-cards'
      aria-label='Pending Opportunities'
    >
      {visible.map(card => (
        <li key={card.id} className='list-none'>
          <button
            type='button'
            data-testid={`chat-empty-opportunity-card-${card.id}`}
            onClick={() => onSelect(card)}
            className={cn(
              CARD_SLOT_MIN_HEIGHT_CLASS,
              'group flex w-full flex-col gap-1 rounded-2xl border border-subtle bg-surface-1 px-3.5 py-2.5 text-left',
              'transition-colors duration-subtle hover:border-focus/30 hover:bg-surface-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
            )}
          >
            <header className='flex items-center gap-1.5 text-2xs font-medium tracking-wide text-quaternary-token'>
              <span className='uppercase'>{card.typeLabel}</span>
              <span aria-hidden='true'>·</span>
              <time dateTime={card.createdAt}>
                {formatOpportunityInboxRelativeTime(card.createdAt)}
              </time>
            </header>
            <div className='flex items-start justify-between gap-2'>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-semibold leading-snug text-primary-token'>
                  {card.title}
                </p>
                <p className='mt-0.5 line-clamp-1 text-xs leading-snug text-tertiary-token'>
                  {card.why}
                </p>
              </div>
              <span
                className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-fast group-hover:text-primary-token'
                aria-hidden='true'
              >
                <ArrowRight className='h-3.5 w-3.5' strokeWidth={2.25} />
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
