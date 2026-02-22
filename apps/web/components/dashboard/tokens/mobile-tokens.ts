/**
 * Mobile-first dashboard tokens for list and drawer-like patterns.
 *
 * Apple Music compact list layout with Linear design tokens.
 * Keep these tokens narrowly scoped to repeated mobile release matrix UI so
 * spacing/typography can evolve consistently without inline class drift.
 */
export const mobileReleaseTokens = {
  row: {
    container:
      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-surface-2/50 focus-visible:outline-none focus-visible:bg-surface-2/50',
    title: 'text-[14px] font-semibold leading-tight text-primary-token',
    subtitle: 'mt-0.5 text-[12px] leading-tight text-secondary-token',
    /** Badge-style type label — pair with getReleaseTypeStyle().bg */
    typeBadge:
      'shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-[16px] uppercase tracking-wide',
    year: 'shrink-0 text-[12px] tabular-nums text-tertiary-token',
    chevron: 'h-3.5 w-3.5 shrink-0 text-quaternary-token',
    /** Dot separator between metadata items */
    dot: 'text-[10px] text-quaternary-token',
  },
  groupHeader:
    'sticky top-0 z-10 flex items-center justify-between border-b border-subtle bg-base px-4 py-2',
  groupHeaderTitle: 'text-[13px] font-semibold text-primary-token',
  groupHeaderCount: 'text-[11px] tabular-nums text-tertiary-token',
  footer: {
    container:
      'flex items-center justify-between border-t border-subtle bg-surface-0 px-4 py-3 text-[13px] text-secondary-token',
    resetButton:
      'text-[13px] text-tertiary-token transition-colors rounded focus-visible:outline-none focus-visible:bg-interactive-hover hover:text-secondary-token',
  },
  swipeActions: {
    button:
      'flex w-16 flex-col items-center justify-center gap-1 text-white transition-colors',
    label: 'text-[10px] font-medium tracking-wide',
    edit: 'bg-indigo-500 active:bg-indigo-600',
    link: 'bg-sky-500 active:bg-sky-600',
    locked: 'bg-neutral-400 opacity-60',
  },
} as const;
