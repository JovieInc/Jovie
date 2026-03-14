'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

type DashboardCardPadding = 'none' | 'compact' | 'default' | 'large';

interface DashboardCardProps {
  readonly variant?:
    | 'default'
    | 'interactive'
    | 'settings'
    | 'analytics'
    | 'empty-state'
    | 'onboarding';
  readonly children: ReactNode;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly hover?: boolean;
  readonly padding?: DashboardCardPadding;
  readonly id?: string;
  readonly role?: string;
  readonly 'data-testid'?: string;
  readonly 'aria-hidden'?: boolean;
  readonly 'aria-label'?: string;
}

const DEFAULT_PADDING_BY_VARIANT: Record<
  NonNullable<DashboardCardProps['variant']>,
  DashboardCardPadding
> = {
  default: 'default',
  interactive: 'default',
  settings: 'none',
  analytics: 'compact',
  'empty-state': 'large',
  onboarding: 'default',
};

export function DashboardCard({
  variant = 'default',
  children,
  className,
  onClick,
  hover = true,
  padding,
  ...props
}: DashboardCardProps) {
  const Component = onClick ? 'button' : 'div';
  const resolvedPadding = padding ?? DEFAULT_PADDING_BY_VARIANT[variant];

  return (
    <Component
      className={cn(
        cardTokens.base,
        cardTokens.padding[resolvedPadding],
        cardTokens.variants[variant],
        !hover &&
          variant === 'interactive' &&
          'hover:shadow-none hover:transform-none hover:ring-0 hover:border-subtle hover:bg-surface-1',
        className
      )}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...props}
    >
      {children}
    </Component>
  );
}
