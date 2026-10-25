'use client';

// @coverage-via apps/web/components/molecules/EmptyToFilled.test.tsx

import type { FocusEvent as ReactFocusEvent, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Selector for the first actionable element in a pane. Mirrors the canonical
 * focusable set; disabled controls are excluded.
 */
const ACTIONABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface EmptyToFilledProps {
  /** Which pane is visible. Controlled — the consumer owns the swap moment. */
  readonly state: 'empty' | 'filled';
  /** Content for the empty pane (compose `EmptyState` here). */
  readonly empty: ReactNode;
  /** Content for the filled pane. */
  readonly children: ReactNode;
  /**
   * Accessible announcement for the current state, announced politely when
   * the swap state changes. Pass state-aware copy (e.g. "Releases loaded").
   */
  readonly announcement: string;
  readonly className?: string;
  readonly testId?: string;
}

/**
 * Empty→filled swap container (JOV-9030).
 *
 * Both panes stay mounted in one grid cell, so the region always reserves
 * the larger of the two heights — the swap never shifts layout. The hidden
 * pane is `invisible` (visibility: hidden), which removes it from the
 * accessibility tree, the focus order, and pointer input without unmounting
 * it. The incoming pane runs exactly one token-timed transition (opacity,
 * `duration-subtle`); under reduced motion the swap is instant. The change
 * is announced through a polite live region. If the focused element lives
 * inside the pane being hidden, focus moves to the new pane's first
 * actionable element (or the pane itself as a last resort) — focus is never
 * lost to `body`.
 */
export function EmptyToFilled({
  state,
  empty,
  children,
  announcement,
  className,
  testId,
}: EmptyToFilledProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const prevStateRef = useRef(state);

  const handleFocusCapture = (event: ReactFocusEvent<HTMLDivElement>) => {
    lastFocusedRef.current =
      event.target instanceof HTMLElement ? event.target : null;
  };

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prevStateRef.current === state) {
      return;
    }
    prevStateRef.current = state;

    const previouslyFocused = lastFocusedRef.current;
    if (!previouslyFocused || !root.contains(previouslyFocused)) {
      return;
    }

    const previousPane =
      previouslyFocused.closest<HTMLElement>('[data-part="pane"]');
    if (!previousPane || previousPane.dataset.pane === state) {
      // Focus was outside the panes, or in the pane that stays visible.
      return;
    }

    const showingPane = root.querySelector<HTMLElement>(
      `[data-part="pane"][data-pane="${state}"]`
    );
    if (!showingPane) {
      return;
    }

    const next =
      showingPane.querySelector<HTMLElement>(ACTIONABLE_SELECTOR) ??
      showingPane;
    next.focus({ preventScroll: true });
    lastFocusedRef.current = next;
  }, [state]);

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      data-part='swap'
      data-state={state}
      className={cn('grid grid-cols-1', className)}
      onFocusCapture={handleFocusCapture}
    >
      <div
        data-part='pane'
        data-pane='empty'
        tabIndex={-1}
        className={cn(
          'col-start-1 row-start-1 transition-opacity duration-subtle ease-subtle motion-reduce:transition-none',
          state === 'empty' ? 'opacity-100' : 'invisible opacity-0'
        )}
      >
        {empty}
      </div>
      <div
        data-part='pane'
        data-pane='filled'
        tabIndex={-1}
        className={cn(
          'col-start-1 row-start-1 transition-opacity duration-subtle ease-subtle motion-reduce:transition-none',
          state === 'filled' ? 'opacity-100' : 'invisible opacity-0'
        )}
      >
        {children}
      </div>
      <span role='status' aria-live='polite' className='sr-only'>
        {announcement}
      </span>
    </div>
  );
}
