export const variantClasses = {
  blue: 'bg-info-subtle border-info/20 text-info',
  green: 'bg-success-subtle border-success/20 text-success',
  purple: 'bg-accent-subtle border-accent/20 text-accent',
  orange: 'bg-warning-subtle border-warning/20 text-warning',
  red: 'bg-error-subtle border-error/20 text-error',
  gray: 'bg-surface-2 border-subtle text-tertiary-token',
} as const;

export const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

export type StatusBadgeVariant = keyof typeof variantClasses;
export type StatusBadgeSize = keyof typeof sizeClasses;
