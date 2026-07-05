'use client';

import { Check } from 'lucide-react';
import { formatTourDateDisplay } from '@/lib/connectors/opportunity-inbox-tour-dates';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

export interface OpportunityInboxTourDateCardProps {
  readonly item: OpportunityInboxTourDateItem;
  readonly onConfirm: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly isBusy?: boolean;
  readonly className?: string;
}

/**
 * Confirm/reject card for a detected tour date. Confirmed dates publish to
 * the public profile; rejected dates move to the hidden rejected section.
 */
export function OpportunityInboxTourDateCard({
  item,
  onConfirm,
  onReject,
  isBusy = false,
  className,
}: OpportunityInboxTourDateCardProps) {
  return (
    <article
      className={cn('system-b-opportunity-inbox-card', className)}
      data-testid={`opportunity-inbox-tour-date-card-${item.id}`}
    >
      <header className='system-b-opportunity-inbox-card-meta'>
        <span className='system-b-opportunity-inbox-card-type'>Tour date</span>
        <span
          aria-hidden='true'
          className='system-b-opportunity-inbox-card-dot'
        >
          ·
        </span>
        <span className='system-b-opportunity-inbox-card-time'>
          Detected via {item.providerLabel}
        </span>
      </header>

      <h2 className='system-b-opportunity-inbox-card-title'>{item.title}</h2>
      <p className='system-b-opportunity-inbox-card-why'>
        {formatTourDateDisplay(item.startDate, item.startTime)} —{' '}
        {item.venueName}, {item.location}. Confirm to show this date on your
        profile.
      </p>

      <div className='system-b-opportunity-inbox-card-actions'>
        <button
          type='button'
          className='system-b-opportunity-inbox-dismiss'
          disabled={isBusy}
          onClick={() => onReject(item.id)}
        >
          Reject
        </button>
        <button
          type='button'
          className='system-b-opportunity-inbox-primary'
          disabled={isBusy}
          onClick={() => onConfirm(item.id)}
        >
          {isBusy ? 'Saving…' : 'Confirm date'}
          <Check className='system-b-opportunity-inbox-primary-icon' />
        </button>
      </div>
    </article>
  );
}
