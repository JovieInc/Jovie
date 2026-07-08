'use client';

import type { ReactNode } from 'react';
import { formatTourDateDisplay } from '@/lib/connectors/opportunity-inbox-tour-dates';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';

interface TourDateRowProps {
  readonly item: OpportunityInboxTourDateItem;
  readonly action?: ReactNode;
}

function TourDateRow({ item, action }: TourDateRowProps) {
  return (
    <li
      className='flex items-center justify-between gap-3 py-1.5'
      data-testid={`opportunity-inbox-tour-date-row-${item.id}`}
    >
      <div className='min-w-0'>
        <span className='block truncate text-sm text-primary-token'>
          {item.title}
        </span>
        <span className='block truncate text-xs text-secondary-token'>
          {formatTourDateDisplay(item.startDate, item.startTime)} ·{' '}
          {item.venueName}, {item.location}
        </span>
      </div>
      {action}
    </li>
  );
}

export interface OpportunityInboxConfirmedTourDatesProps {
  readonly items: readonly OpportunityInboxTourDateItem[];
}

/** Visible list of confirmed upcoming tour dates (mirrors the profile). */
export function OpportunityInboxConfirmedTourDates({
  items,
}: OpportunityInboxConfirmedTourDatesProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className='system-b-opportunity-inbox-feed'
      data-testid='opportunity-inbox-confirmed-tour-dates'
      aria-label='Confirmed Tour Dates'
    >
      <div className='system-b-opportunity-inbox-section-label'>
        Confirmed Tour Dates
      </div>
      <ul className='m-0 list-none p-0'>
        {items.map(item => (
          <TourDateRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

export interface OpportunityInboxRejectedTourDatesProps {
  readonly items: readonly OpportunityInboxTourDateItem[];
  readonly onUndoReject: (id: string) => void;
  readonly pendingUndoId?: string | null;
}

/**
 * Hidden-by-default rejected bucket. Collapsed behind a disclosure so
 * rejected signals stay out of the way but remain auditable and undoable.
 */
export function OpportunityInboxRejectedTourDates({
  items,
  onUndoReject,
  pendingUndoId = null,
}: OpportunityInboxRejectedTourDatesProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <details
      className='system-b-opportunity-inbox-feed'
      data-testid='opportunity-inbox-rejected-tour-dates'
    >
      <summary className='system-b-opportunity-inbox-section-label cursor-pointer list-none select-none'>
        Rejected Tour Dates ({items.length})
      </summary>
      <ul className='m-0 list-none p-0'>
        {items.map(item => (
          <TourDateRow
            key={item.id}
            item={item}
            action={
              <button
                type='button'
                className='system-b-opportunity-inbox-dismiss shrink-0'
                disabled={pendingUndoId === item.id}
                onClick={() => onUndoReject(item.id)}
              >
                {pendingUndoId === item.id ? 'Restoring…' : 'Undo'}
              </button>
            }
          />
        ))}
      </ul>
    </details>
  );
}
