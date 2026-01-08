/**
 * Modal Component Tokens
 *
 * Reusable token system for dashboard modals with Linear design language.
 * Provides consistent styling for modal overlays, containers, headers, and footers.
 */

export const modalTokens = {
  overlay: {
    base: 'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    dark: 'bg-black/60 dark:bg-black/80',
  },

  container: {
    base: `
      fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2
      max-h-[85vh] overflow-y-auto rounded-2xl
      bg-[var(--color-bg-surface-1)] border border-[var(--color-border-default)]
      shadow-[var(--shadow-xl)]
      data-[state=open]:animate-in data-[state=closed]:animate-out
      data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
      data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
      data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]
      data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]
    `,
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  },

  header: {
    base: 'px-6 pt-6 space-y-2',
    withCloseButton: 'pr-16',
  },

  title:
    'text-xl font-semibold text-[var(--color-text-primary-token)] dashboard-h3',

  description: 'text-sm text-[var(--color-text-secondary-token)]',

  body: {
    base: 'px-6 py-6',
    withFooter: 'pb-4',
  },

  footer: {
    base: 'px-6 pb-6 flex items-center justify-end gap-3 border-t border-[var(--color-border-subtle)] pt-4',
    spaceBetween: 'justify-between',
  },

  closeButton:
    'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-[var(--color-bg-surface-1)] transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 disabled:pointer-events-none',
} as const;
