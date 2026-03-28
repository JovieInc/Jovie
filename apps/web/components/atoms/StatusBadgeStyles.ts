export const variantClasses = {
  blue: 'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-blue-600 dark:text-blue-400',
  green:
    'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-emerald-600 dark:text-emerald-400',
  purple:
    'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-violet-600 dark:text-violet-400',
  orange:
    'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-amber-600 dark:text-amber-400',
  red: 'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-red-600 dark:text-red-400',
  gray: 'bg-(--linear-bg-surface-0) border-(--linear-border-subtle) text-tertiary-token',
} as const;

export const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

export type StatusBadgeVariant = keyof typeof variantClasses;
export type StatusBadgeSize = keyof typeof sizeClasses;
