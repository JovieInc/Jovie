import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type NavBadgeElementProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'>;

type CountNavBadgeProps = NavBadgeElementProps & {
  readonly variant: 'count';
  readonly count: number | string;
};

type LabelNavBadgeProps = NavBadgeElementProps & {
  readonly variant: 'pro' | 'new';
  readonly count?: never;
};

export type NavBadgeProps = CountNavBadgeProps | LabelNavBadgeProps;

const NAV_BADGE_LABELS = {
  pro: 'Pro',
  new: 'New',
} as const;

/**
 * Compact status metadata for app-shell navigation.
 *
 * Count badges accept native span metadata (including `aria-label`, `title`,
 * and spacing classes) so callers can keep the visible value terse while
 * exposing its meaning to assistive technology.
 */
export function NavBadge({ variant, className, ...props }: NavBadgeProps) {
  const { count, ...spanProps } = props;
  const content = variant === 'count' ? count : NAV_BADGE_LABELS[variant];

  return (
    <span
      {...spanProps}
      data-nav-badge={variant}
      className={cn(
        'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-3xs font-medium leading-none select-none',
        variant === 'count' &&
          'bg-sidebar-accent/45 tabular-nums text-sidebar-item-icon',
        variant === 'pro' &&
          'border border-subtle bg-surface-1 px-1.5 font-semibold tracking-wider text-secondary-token',
        variant === 'new' &&
          'bg-sidebar-accent-active px-1.5 text-primary-token',
        className
      )}
    >
      {content}
    </span>
  );
}
