/**
 * Mobile-first dashboard tokens for list and drawer-like patterns.
 *
 * Apple Music compact list layout with Linear design tokens.
 * Keep these tokens narrowly scoped to repeated mobile release matrix UI so
 * spacing/typography can evolve consistently without inline class drift.
 */
export const mobileReleaseTokens = {
  list: 'overflow-hidden rounded-2xl border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface)',
  row: {
    container:
      'flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color,border-color] active:bg-surface-0 focus-visible:outline-none focus-visible:bg-surface-0',
    title: 'text-[14px] font-semibold leading-tight text-primary-token',
    subtitle: 'mt-0.5 text-xs leading-tight text-secondary-token',
    /** Badge-style type label — pair with getReleaseTypeStyle().bg */
    typeBadge:
      'inline-flex h-[16px] shrink-0 items-center justify-center rounded-md px-1.5 py-0 align-middle text-3xs font-caption leading-none tracking-normal',
    year: 'shrink-0 text-xs tabular-nums text-tertiary-token',
    chevron: 'h-3.5 w-3.5 shrink-0 text-quaternary-token',
    /** Dot separator between metadata items */
    dot: 'text-3xs text-quaternary-token',
  },
  groupHeader:
    'sticky top-0 z-10 flex items-center justify-between border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 py-2',
  groupHeaderTitle: 'text-xs font-semibold text-primary-token',
  groupHeaderCount: 'text-2xs tabular-nums text-tertiary-token',
  footer: {
    container:
      'flex items-center justify-between border-t border-subtle bg-surface-0 px-4 py-3 text-app text-secondary-token',
    resetButton:
      'text-app text-tertiary-token transition-colors rounded focus-visible:outline-none focus-visible:bg-interactive-hover hover:text-secondary-token',
  },
  swipeActions: {
    button:
      'flex w-16 flex-col items-center justify-center gap-1 text-white transition-colors',
    label: 'text-3xs font-caption tracking-normal',
    edit: 'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_72%,var(--linear-accent))] active:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,var(--linear-accent))]',
    link: 'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,var(--linear-info))] active:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_58%,var(--linear-info))]',
    locked:
      'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-accent-gray))] opacity-75',
  },
} as const;
