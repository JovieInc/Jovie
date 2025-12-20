import React from 'react';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

interface DashboardCardProps {
  variant?:
    | 'default'
    | 'interactive'
    | 'settings'
    | 'analytics'
    | 'empty-state'
    | 'onboarding';
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  padding?: 'default' | 'large' | 'compact';
}

type DashboardCardElementProps = DashboardCardProps &
  Omit<React.ComponentPropsWithoutRef<'div'>, keyof DashboardCardProps>;

export function DashboardCard({
  variant = 'default',
  children,
  className,
  onClick,
  hover = true,
  padding = 'default',
  ...rest
}: DashboardCardElementProps) {
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
      {...rest}
    >
      {children}
    </Component>
  );
}
