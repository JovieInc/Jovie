import React from 'react';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

interface DashboardCardProps {
  readonly variant?:
    | 'default'
    | 'interactive'
    | 'settings'
    | 'analytics'
    | 'empty-state'
    | 'onboarding';
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly hover?: boolean;
  readonly padding?: 'default' | 'large' | 'compact';
}

export function DashboardCard({
  variant = 'default',
  children,
  className,
  onClick,
  hover = true,
  padding = 'default',
}: DashboardCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={cn(
        cardTokens.base,
        cardTokens.padding[padding],
        cardTokens.variants[variant],
        !hover &&
          variant === 'interactive' &&
          'hover:shadow-none hover:transform-none hover:ring-0 hover:border-subtle hover:bg-surface-1',
        className
      )}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Component>
  );
}
