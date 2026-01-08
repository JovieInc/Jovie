/**
 * Table Component Tokens
 *
 * Reusable token system for dashboard tables with Linear design language.
 * Provides consistent styling for table containers, headers, rows, and cells.
 */

export const tableTokens = {
  container: 'flex-1 min-h-0 overflow-auto bg-[var(--color-bg-surface-1)]',
  base: 'w-full min-w-[960px] border-separate border-spacing-0 dashboard-micro',

  header: {
    base: 'sticky top-0 z-20 bg-[var(--color-bg-surface-1)]/75 backdrop-blur-md',
    elevated: 'shadow-sm shadow-black/10 dark:shadow-black/40',
    row: 'dashboard-label text-[var(--color-text-tertiary-token)]',
    cell: 'border-b border-[var(--color-border-subtle)] px-4 py-3 text-left font-semibold',
    cellSortable:
      'cursor-pointer hover:text-[var(--color-text-secondary-token)] transition-colors',
  },

  row: {
    base: 'border-b border-[var(--color-border-subtle)] transition-colors duration-100',
    interactive:
      'cursor-pointer hover:bg-[var(--color-bg-surface-2)] active:bg-[var(--color-bg-surface-3)]',
    selected: 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)]',
    last: 'border-b-0',
  },

  cell: {
    base: 'px-4 py-3 text-[var(--color-text-primary-token)]',
    secondary: 'text-[var(--color-text-secondary-token)]',
    numeric: 'text-right tabular-nums',
    truncate: 'max-w-[200px] truncate',
  },
} as const;
