'use client';

import { Sparkles } from 'lucide-react';
import { OpportunityCard } from '@/components/organisms/opportunity-card/OpportunityCard';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

/** Lightweight entry points retain the full card for the existing detail flow. */
export interface ChatEmptyStateOpportunityCardsProps {
  readonly cards: readonly OpportunityInboxCardViewModel[];
  readonly onSelect: (card: OpportunityInboxCardViewModel) => void;
  readonly className?: string;
}

const MAX_CARDS = 3;

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
        'mx-auto flex w-full max-w-[28rem] list-none flex-col gap-1 p-0',
        className
      )}
      data-testid='chat-empty-state-opportunity-cards'
      aria-label='Pending Opportunities'
    >
      {visible.map(card => (
        <li key={card.id} className='list-none'>
          <OpportunityCard
            format='compact'
            title={card.title}
            description={card.why}
            icon={<Sparkles className='size-3.5' />}
            dataTestId={`chat-empty-opportunity-card-${card.id}`}
            onSelect={() => onSelect(card)}
          />
        </li>
      ))}
    </ul>
  );
}
