import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import {
  BADGE_SHARED_GEOMETRY_CLASS,
  BADGE_SIZE_GEOMETRY,
} from '../lib/badge-geometry-contract';

const badgeVariants = cva(BADGE_SHARED_GEOMETRY_CLASS, {
  variants: {
    variant: {
      default:
        'border-(--color-border-strong) bg-(--color-bg-primary) text-(--linear-text-primary)',
      secondary:
        'border-(--color-border-strong) bg-(--color-bg-primary) text-(--linear-text-tertiary)',
      destructive: 'border-error/20 bg-(--color-error-subtle) text-error',
      outline:
        'border-(--color-border-default) bg-transparent text-(--linear-text-secondary)',
      success: 'border-success/20 bg-(--color-success-subtle) text-success',
      warning: 'border-warning/20 bg-(--color-warning-subtle) text-warning',
      'permission-restricted':
        'border-(--state-permission-border) bg-(--state-permission-bg) text-(--state-permission-fg)',
      // Backwards-compat aliases
      primary:
        'border-(--color-border-strong) bg-(--color-bg-primary) text-(--linear-text-primary)',
      error: 'border-error/20 bg-(--color-error-subtle) text-error',
    },
    size: BADGE_SIZE_GEOMETRY,
    tone: {
      neutral: 'border-subtle bg-surface-1 text-tertiary-token',
      info: 'border-info/20 bg-surface-1 text-info',
      success: 'border-success/20 bg-surface-1 text-success',
      accent: 'border-accent/20 bg-surface-1 text-accent',
      warning: 'border-warning/20 bg-surface-1 text-warning',
      error: 'border-error/20 bg-surface-1 text-error',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, tone, ...props }, ref) => {
    const dataState =
      variant === 'permission-restricted' ? 'permission-restricted' : undefined;

    return (
      <span
        ref={ref}
        data-size={size ?? 'md'}
        data-state={dataState}
        data-tone={tone ?? undefined}
        data-variant={variant ?? 'default'}
        className={cn(badgeVariants({ variant, size, tone }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
