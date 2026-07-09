'use client';

import { X } from 'lucide-react';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';
import { CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME } from '../chat-layout';

/**
 * Pinned opportunity header for card-opened chat mode (GH #13177 / #13174).
 * Sits above the transcript; composer stays at the bottom.
 */
export interface ChatPinnedOpportunityHeaderProps {
  readonly card: OpportunityInboxCardViewModel;
  readonly onUnpin: () => void;
  readonly className?: string;
}

export function ChatPinnedOpportunityHeader({
  card,
  onUnpin,
  className,
}: ChatPinnedOpportunityHeaderProps) {
  return (
    <div
      className={cn(
        CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME,
        'sticky top-0 z-10 mb-4',
        className
      )}
      data-testid='chat-pinned-opportunity-header'
    >
      <div className='flex items-start gap-3 rounded-2xl border border-subtle bg-surface-1 px-3.5 py-2.5'>
        <div className='min-w-0 flex-1'>
          <p className='text-2xs font-medium uppercase tracking-wide text-quaternary-token'>
            {card.typeLabel}
          </p>
          <p className='mt-0.5 truncate text-sm font-semibold text-primary-token'>
            {card.title}
          </p>
          <p className='mt-0.5 line-clamp-2 text-xs text-tertiary-token'>
            {card.why}
          </p>
        </div>
        <button
          type='button'
          onClick={onUnpin}
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-fast hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
          aria-label='Unpin Opportunity'
          data-testid='chat-pinned-opportunity-unpin'
        >
          <X className='h-3.5 w-3.5' strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
