import { type BadgeProps, Badge as BaseBadge } from '@jovie/ui';
import React from 'react';
import { cn } from '@/lib/utils';

export interface AppBadgeProps extends BadgeProps {
  readonly emphasis?: 'default' | 'subtle';
}

export const Badge = React.forwardRef<HTMLSpanElement, AppBadgeProps>(
  ({ className, emphasis = 'default', ...props }, ref) => {
    return (
      <BaseBadge
        ref={ref}
        className={cn(
          'tracking-tight',
          emphasis === 'subtle' && 'bg-surface-1 text-muted-foreground',
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
