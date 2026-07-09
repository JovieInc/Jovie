'use client';

import { type TouchEvent as ReactTouchEvent, useCallback, useRef } from 'react';
import { formatTourDateDisplay } from '@/lib/connectors/opportunity-inbox-tour-dates';
import type { OpportunityInboxTourDateItem } from '@/lib/connectors/opportunity-inbox-types';
import { cn } from '@/lib/utils';

/* ─── Dot color by status ────────────────────────────────────────────── */

const DOT_COLOR: Record<OpportunityInboxTourDateItem['status'], string> = {
  pending: 'var(--color-accent-orange)',
  confirmed: 'var(--color-accent-green)',
  rejected: 'var(--color-text-quaternary-token)',
};

const ACTION_ACCENT: Record<OpportunityInboxTourDateItem['status'], string> = {
  pending: 'var(--color-accent-orange)',
  confirmed: 'var(--color-accent-green)',
  rejected: 'transparent',
};

/* ─── Mobile swipe touch state ────────────────────────────────────────── */

interface SwipeState {
  startX: number;
}

export interface OpportunityInboxTourDateRowProps {
  readonly item: OpportunityInboxTourDateItem;
  readonly onConfirm: (id: string) => void;
  readonly onReject: (id: string) => void;
  readonly isBusy?: boolean;
  readonly className?: string;
}

/**
 * Flat row for a detected tour date in the opportunity inbox.
 *
 * Follows the same visual pattern as OpportunityRow (dot + two-line type +
 * hover-reveal actions) but uses orange accent (event/tour date) instead
 * of the blue-purple primary accent.
 *
 * States:
 * - pending → orange dot, hover-reveal {accent-ring ✓ · faint ×}
 * - confirmed → green dot, persistent green-ring ✓
 * - rejected → gray dot, no actions
 */
export function OpportunityInboxTourDateRow({
  item,
  onConfirm,
  onReject,
  isBusy = false,
  className,
}: OpportunityInboxTourDateRowProps) {
  const swipeRef = useRef<SwipeState | null>(null);

  const dotColor = DOT_COLOR[item.status];
  const actionAccent = ACTION_ACCENT[item.status];
  const isActionable = item.status === 'pending';
  const isPersistent = item.status === 'confirmed';

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const handleConfirm = useCallback(() => {
    if (!isBusy && isActionable) onConfirm(item.id);
  }, [item.id, isBusy, isActionable, onConfirm]);

  const handleReject = useCallback(() => {
    if (!isBusy && isActionable) onReject(item.id);
  }, [item.id, isBusy, isActionable, onReject]);

  /* ── Mobile touch swipe ───────────────────────────────────────────── */
  const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    swipeRef.current = { startX: touch.clientX };
  }, []);

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      const s = swipeRef.current;
      if (!s) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - s.startX;
      if (dx < -60) handleReject();
      else if (dx > 60 && isActionable) handleConfirm();
      swipeRef.current = null;
    },
    [isActionable, handleReject, handleConfirm]
  );

  const metadataLine = (() => {
    const datePart = formatTourDateDisplay(item.startDate, item.startTime);
    return `${datePart} · ${item.venueName}, ${item.location}`;
  })();

  return (
    <li
      className={cn('group/row list-none overflow-hidden', className)}
      data-testid={`tour-date-row-${item.id}`}
      data-status={item.status}
    >
      <div
        className={cn(
          'min-h-12 flex items-center gap-3 px-5 py-2.5',
          'rounded-none',
          'transition-[background-color] duration-subtle',
          'group-hover/row:bg-surface-0'
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Status dot — 5px circle */}
        <span
          className='block size-1.5 shrink-0 rounded-full'
          aria-hidden='true'
          style={{
            backgroundColor: dotColor,
          }}
        />

        {/* Type column — two lines */}
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          {/* Line 1: Title — 13px semi-bold (--text-app) */}
          <span
            className={cn(
              'truncate font-medium leading-tight tracking-tight',
              'text-primary-token text-app'
            )}
          >
            {item.title}
          </span>

          {/* Line 2: Metadata — muted 10px (--text-2xs) */}
          <span className='truncate text-tertiary-token text-2xs'>
            {metadataLine}
          </span>
        </div>

        {/* Action zone — only for actionable/persistent states */}
        {isActionable || isPersistent ? (
          <div
            className={cn(
              'flex items-center gap-2 shrink-0 min-w-0',
              'transition-opacity duration-subtle',
              isPersistent
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto'
            )}
          >
            {/* Ghost accent ring pill — 2px border, no fill */}
            <button
              type='button'
              className={cn(
                'inline-flex items-center justify-center',
                'rounded-full min-w-7 min-h-7 px-2',
                'bg-transparent border-2',
                'transition-colors duration-subtle',
                'cursor-pointer select-none',
                isBusy && 'cursor-not-allowed opacity-50',
                isPersistent ? 'text-primary-token' : 'text-accent-token'
              )}
              style={{
                borderColor: actionAccent,
              }}
              onClick={handleConfirm}
              disabled={isBusy || !isActionable}
              aria-label={isPersistent ? 'Confirmed' : 'Confirm Tour Date'}
            >
              ✓
            </button>

            {/* Dismiss (reject) button — only visible on hover for pending */}
            {!isPersistent && isActionable ? (
              <button
                type='button'
                className={cn(
                  'inline-flex items-center justify-center',
                  'rounded-full size-7',
                  'bg-transparent',
                  'text-quaternary-token text-app',
                  'transition-colors duration-subtle',
                  'hover:text-secondary-token',
                  'cursor-pointer select-none',
                  isBusy && 'cursor-not-allowed opacity-30'
                )}
                onClick={handleReject}
                disabled={isBusy}
                aria-label='Reject Tour Date'
              >
                &times;
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
