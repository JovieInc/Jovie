'use client';

import {
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import { type OpportunityRowProps, type OpportunityRowState } from './types';

/* ─── State-dependent token maps ─────────────────────────────────────── */

const DOT_COLOR: Record<OpportunityRowState, string> = {
  new: 'var(--color-accent)',
  accepted: '#2b8a3e',
  rejected: 'var(--color-text-quaternary-token)',
  'in-progress': '#d97a00',
  reported: 'var(--color-text-quaternary-token)',
};

const ACTION_ACCENT: Record<OpportunityRowState, string> = {
  new: 'var(--color-accent)',
  accepted: '#2b8a3e',
  rejected: 'transparent',
  'in-progress': '#d97a00',
  reported: 'transparent',
};

/**
 * Whether the row state has a persistent (non-hover) action indicator.
 */
function hasPersistentAction(state: OpportunityRowState): boolean {
  return state === 'accepted';
}

/**
 * Whether the row action is a checkmark rather than an arrow.
 */
function isCheckmarkState(state: OpportunityRowState): boolean {
  return state === 'accepted';
}

/**
 * Whether the state shows any action chrome at all.
 */
function hasActionChrome(state: OpportunityRowState): boolean {
  return state !== 'rejected' && state !== 'reported';
}

/* ─── Mobile swipe touch state ────────────────────────────────────────── */

interface SwipeState {
  startX: number;
}

/**
 * OpportunityRow — canonical inbox row component.
 *
 * A flat, no-border, no-container list item that provides:
 * - Resting: 5px status dot + two-line type (title, metadata)
 * - Hover: ghost accent ring pill with → arrow + faint x dismiss
 * - Active/planned: persistent accent ring with checkmark
 * - Mobile swipe: left = dismiss, right = accept/plan
 *
 * Uses only System B tokens. No hardcoded radii/colors.
 */
export function OpportunityRow({
  id,
  state,
  title,
  metadata,
  hideDot = false,
  onPrimaryAction,
  onDismiss,
  isBusy = false,
  className,
  dataTestId,
}: OpportunityRowProps) {
  const [hovered, setHovered] = useState(false);
  const [_swiping, setSwiping] = useState<'left' | 'right' | null>(null);
  const swipeRef = useRef<SwipeState | null>(null);

  const dotColor = DOT_COLOR[state];
  const actionAccent = ACTION_ACCENT[state];
  const persistentAction = hasPersistentAction(state);
  const showCheckmark = isCheckmarkState(state);
  const rowHasAction = hasActionChrome(state);

  /* ── Hover reveal logic (desktop) ──────────────────────────────────── */
  const showActionChrome = persistentAction || (rowHasAction && hovered);

  /* ── Primary action handler ─────────────────────────────────────────── */
  const handlePrimaryAction = useCallback(() => {
    if (!isBusy && rowHasAction) {
      onPrimaryAction?.(id);
    }
  }, [id, isBusy, rowHasAction, onPrimaryAction]);

  /* ── Dismiss handler ────────────────────────────────────────────────── */
  const handleDismiss = useCallback(() => {
    if (!isBusy) {
      onDismiss?.(id);
    }
  }, [id, isBusy, onDismiss]);

  /* ── Mobile touch swipe handlers ───────────────────────────────────── */
  const handleTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    swipeRef.current = { startX: touch.clientX };
  }, []);

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const s = swipeRef.current;
      if (!s || !rowHasAction) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - s.startX;
      if (dx < -20) setSwiping('left');
      else if (dx > 20) setSwiping('right');
      else setSwiping(null);
    },
    [rowHasAction]
  );

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const s = swipeRef.current;
      if (!s) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - s.startX;
      // Left swipe = dismiss, right swipe = plan
      if (dx < -60) handleDismiss();
      else if (dx > 60 && rowHasAction) handlePrimaryAction();
      setSwiping(null);
      swipeRef.current = null;
    },
    [rowHasAction, handleDismiss, handlePrimaryAction]
  );

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: interactive list row for hover/swipe actions
    <li
      className={cn('group/row list-none overflow-hidden', className)}
      data-testid={dataTestId ?? `opportunity-row-${id}`}
      data-state={state}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={cn(
          'min-h-[48px] flex items-center gap-3 px-5 py-2.5',
          'rounded-none',
          'transition-[background-color] duration-subtle',
          hovered && 'bg-surface-0/40'
        )}
      >
        {/* Status dot — 5px circle */}
        {!hideDot ? (
          <span
            className='block shrink-0 rounded-full'
            aria-hidden='true'
            style={{
              width: 5,
              height: 5,
              backgroundColor: dotColor,
              minWidth: 5,
              minHeight: 5,
            }}
          />
        ) : (
          <span className='block w-[5px] shrink-0' aria-hidden='true' />
        )}

        {/* Type column — two lines */}
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          {/* Line 1: Title — 13px semi-bold (--text-app) */}
          <span
            className={cn(
              'truncate font-[590] leading-tight tracking-[-0.01em]',
              'text-primary-token'
            )}
            style={{ fontSize: 'var(--text-app)' }}
          >
            {title}
          </span>

          {/* Line 2: Metadata — muted 10px (--text-2xs) */}
          {metadata ? (
            <span
              className='truncate text-tertiary-token'
              style={{ fontSize: 'var(--text-2xs)' }}
            >
              {metadata}
            </span>
          ) : null}
        </div>

        {/* Action zone — not rendered for rejected/reported states per spec.
            For actionable states: hidden in resting state (opacity-0),
            revealed on hover or persistent for accepted/planned. */}
        {rowHasAction ? (
          <div
            className={cn(
              'flex items-center gap-2 shrink-0 min-w-0',
              'transition-opacity duration-subtle',
              showActionChrome ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            {/* Ghost accent ring pill — 2px border, no fill */}
            <button
              type='button'
              className={cn(
                'inline-flex items-center justify-center',
                'rounded-full',
                'bg-transparent',
                'transition-colors duration-subtle',
                'cursor-pointer',
                'select-none',
                isBusy && 'cursor-not-allowed opacity-50',
                showCheckmark || persistentAction
                  ? 'text-primary-token'
                  : 'text-accent-token'
              )}
              style={{
                border: `2px solid ${actionAccent}`,
                padding: '2px 8px',
                minWidth: 28,
                minHeight: 28,
              }}
              onClick={handlePrimaryAction}
              disabled={isBusy || !rowHasAction}
              aria-label={showCheckmark ? 'Planned' : 'Plan opportunity'}
            >
              {showCheckmark ? '✓' : '→'}
            </button>

            {/* Dismiss button — faint x, secondary to the primary.
                Hidden on persistent-action states (accepted/planned). */}
            {!persistentAction ? (
              <button
                type='button'
                className={cn(
                  'inline-flex items-center justify-center',
                  'rounded-full w-7 h-7',
                  'bg-transparent',
                  'text-quaternary-token',
                  'transition-colors duration-subtle',
                  'hover:text-secondary-token',
                  'cursor-pointer',
                  'select-none',
                  isBusy && 'cursor-not-allowed opacity-30'
                )}
                onClick={handleDismiss}
                disabled={isBusy}
                aria-label='Dismiss Opportunity'
                style={{ fontSize: 'var(--text-app)' }}
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
