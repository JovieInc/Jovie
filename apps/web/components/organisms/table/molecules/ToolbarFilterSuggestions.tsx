'use client';

// @coverage-via apps/web/tests/unit/components/table/ToolbarFilterSuggestions.test.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ToolbarFilterSuggestion {
  readonly id: string;
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly onSelect: () => void;
}

export interface ToolbarFilterSuggestionsProps {
  readonly suggestions: readonly ToolbarFilterSuggestion[];
  /**
   * True while the owning filter dropdown/sheet is open. The row stays
   * mounted and keeps its reserved space — only opacity and interactivity
   * change — so opening the filter popover never shifts toolbar layout.
   */
  readonly hidden?: boolean;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

const SUGGESTION_PILL_CLASS = cn(
  'inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-subtle bg-transparent px-3 text-2xs font-medium text-tertiary-token transition-colors duration-subtle ease-subtle hover:border-default hover:bg-surface-1 hover:text-primary-token',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface) outline-none'
);

/**
 * Hover/focus-revealed row of quick-apply filter suggestions shown next to
 * the filter button (e.g. "Status · Draft"). Sits at opacity 0 at rest and
 * fades in when the surrounding `group/toolbar-filters` ancestor is hovered
 * or contains focus, with space always reserved so revealing it never
 * shifts the toolbar. Hides (without unmounting) while `hidden` is true so
 * it never competes with an open filter dropdown.
 */
export function ToolbarFilterSuggestions({
  suggestions,
  hidden = false,
  className,
  'data-testid': testId,
}: ToolbarFilterSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      data-testid={testId}
      aria-hidden={hidden || undefined}
      className={cn(
        'flex min-w-0 items-center gap-1 overflow-hidden opacity-0 transition-opacity duration-subtle ease-subtle motion-reduce:transition-none',
        'group-hover/toolbar-filters:opacity-100 group-focus-within/toolbar-filters:opacity-100',
        hidden && '!opacity-0 pointer-events-none',
        className
      )}
    >
      {suggestions.map(suggestion => (
        <button
          key={suggestion.id}
          type='button'
          tabIndex={hidden ? -1 : 0}
          onClick={suggestion.onSelect}
          aria-label={suggestion.ariaLabel}
          className={SUGGESTION_PILL_CLASS}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
