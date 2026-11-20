'use client';

import { useEffect, useState } from 'react';

/** Longest the release list holds its first paint for Apple Music eligibility. */
export const INITIAL_LIST_PAINT_BUDGET_MS = 400;

interface InitialListPaintGateInput {
  /** Whether the Apple Music eligibility read applies to this list. */
  readonly shouldResolve: boolean;
  readonly isLoading: boolean;
  /** Failed attempts so far; a retrying read never holds the list. */
  readonly failureCount: number | undefined;
}

/**
 * Holds the release list's first paint while Apple Music eligibility loads,
 * so the eligibility banner and the rows appear together instead of the rows
 * jumping down when the banner lands. The hold is bounded: it ends when the
 * read settles, on its first failed attempt, or after
 * INITIAL_LIST_PAINT_BUDGET_MS, whichever comes first. The banner is a
 * supplementary read, so it never keeps the catalog itself off the screen.
 * Once the list has painted it is never held again, so a later read (after a
 * Spotify import, say) keeps open menus, selection and focus mounted.
 */
export function useInitialListPaintGate({
  shouldResolve,
  isLoading,
  failureCount,
}: InitialListPaintGateInput): boolean {
  const [hasPainted, setHasPainted] = useState(false);
  const [budgetSpent, setBudgetSpent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setBudgetSpent(true),
      INITIAL_LIST_PAINT_BUDGET_MS
    );
    return () => clearTimeout(timer);
  }, []);

  const holdPaint =
    !hasPainted && !budgetSpent && shouldResolve && isLoading && !failureCount;

  useEffect(() => {
    if (!hasPainted && !holdPaint) setHasPainted(true);
  }, [hasPainted, holdPaint]);

  return holdPaint;
}
