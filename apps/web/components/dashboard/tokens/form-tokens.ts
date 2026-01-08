/**
 * Form Component Tokens
 *
 * Reusable token system for dashboard forms with Linear design language.
 * Provides consistent styling for form fields, labels, inputs, and validation states.
 */

export const formTokens = {
  container: 'space-y-4',
  field: {
    base: 'space-y-2',
    inline: 'flex items-center gap-3',
  },

  label: {
    base: 'text-sm font-medium text-[var(--color-text-secondary-token)] dashboard-text',
    required: 'after:content-["*"] after:ml-1 after:text-[var(--color-error)]',
    disabled: 'text-[var(--color-text-disabled-token)] cursor-not-allowed',
  },

  input: {
    valid:
      'border-[var(--color-success)] focus-within:ring-[var(--color-success)]',
    invalid:
      'border-[var(--color-error)] focus-within:ring-[var(--color-error)]',
    warning:
      'border-[var(--color-warning)] focus-within:ring-[var(--color-warning)]',
  },

  helpText: {
    base: 'text-xs text-[var(--color-text-tertiary-token)]',
    error: 'text-[var(--color-error)] animate-in fade-in duration-200',
    success: 'text-[var(--color-success)] animate-in fade-in duration-200',
  },

  banner: {
    success:
      'p-3 bg-[var(--color-success-subtle)] border border-[var(--color-success)] rounded-lg text-sm text-[var(--color-success)]',
    error:
      'p-3 bg-[var(--color-error-subtle)] border border-[var(--color-error)] rounded-lg text-sm text-[var(--color-error)]',
    warning:
      'p-3 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)] rounded-lg text-sm text-[var(--color-warning-foreground)]',
  },
} as const;
