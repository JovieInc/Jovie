'use client';

import { Icon } from '@/components/atoms/Icon';
import type { ContextMenuItemType } from '@/components/organisms/table';
import { normalizeTicketUrl } from '@/lib/events/ticket-url';
import type { EventRecord } from '@/lib/queries/useEventsQuery';

export type CalendarEventActionVariant = 'confirmed' | 'pending' | 'rejected';

export interface BuildCalendarEventActionsOptions {
  readonly variant: CalendarEventActionVariant;
  readonly onConfirm?: () => void;
  readonly onReject?: () => void;
  readonly onUndoReject?: () => void;
  readonly disabled?: boolean;
}

/**
 * The single Calendar event action source for row overflow and right-click
 * context menus. It deliberately exposes only already-supported actions.
 */
export function buildCalendarEventActions(
  event: EventRecord,
  options: BuildCalendarEventActionsOptions
): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];
  const ticketUrl = normalizeTicketUrl(event.ticketUrl);

  if (ticketUrl) {
    items.push({
      id: 'open-tickets',
      label: 'Open Tickets',
      icon: <Icon name='Ticket' className='h-4 w-4' />,
      onClick: () => {
        globalThis.open(ticketUrl, '_blank', 'noopener,noreferrer');
      },
    });
  }

  if (options.variant === 'pending' && options.onConfirm) {
    items.push({
      id: 'confirm',
      label: 'Confirm',
      icon: <Icon name='Check' className='h-4 w-4' />,
      onClick: options.onConfirm,
      disabled: options.disabled,
    });
  }

  if (
    (options.variant === 'pending' || options.variant === 'confirmed') &&
    options.onReject
  ) {
    items.push({
      id: 'reject',
      label: 'Reject',
      icon: <Icon name='X' className='h-4 w-4' />,
      onClick: options.onReject,
      disabled: options.disabled,
      destructive: true,
    });
  }

  if (options.variant === 'rejected' && options.onUndoReject) {
    items.push({
      id: 'undo-reject',
      label: 'Undo Reject',
      icon: <Icon name='Undo2' className='h-4 w-4' />,
      onClick: options.onUndoReject,
      disabled: options.disabled,
    });
  }

  return items;
}
