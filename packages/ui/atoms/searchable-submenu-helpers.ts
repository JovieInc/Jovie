import type * as React from 'react';

/**
 * Pure helpers for SearchableSubmenu: filtering, keyboard index stepping and
 * deferred focus. Kept apart so the component stays under the size cap.
 */

/** The item fields these helpers read; SearchableSubmenuItem satisfies it. */
export interface SearchableItemFields {
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export function defaultFilterFn(
  item: SearchableItemFields,
  query: string
): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return true;

  const searchableText = [item.label, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

export function firstEnabledIndex(
  items: readonly SearchableItemFields[]
): number {
  const index = items.findIndex(item => !item.disabled);
  return Math.max(index, 0);
}

export function nextEnabledIndex(
  items: readonly SearchableItemFields[],
  currentIndex: number,
  direction: 1 | -1
): number {
  if (items.every(item => item.disabled)) return 0;

  let candidate = currentIndex;
  do {
    candidate = (candidate + direction + items.length) % items.length;
  } while (items[candidate]?.disabled);

  return candidate;
}

/** Focus an element on the next tick, after portalled content mounts. */
export function focusOnNextTick(
  ref: React.RefObject<HTMLElement | null>
): () => void {
  const timer = setTimeout(() => {
    ref.current?.focus();
  }, 0);
  return () => clearTimeout(timer);
}
