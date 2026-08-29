import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 rounded-full border border-transparent align-middle whitespace-nowrap px-2 py-0.5 text-xs font-medium tracking-[-0.006em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/30 focus-visible:ring-offset-1',
  {
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
      size: {
        sm: 'px-1.5 py-0 text-3xs leading-[18px]',
        md: 'px-2 py-0.5 text-xs leading-[20px]',
        lg: 'px-2.5 py-0.5 text-xs',
        xl: 'px-3 py-1 text-xs',
      },
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
  }
);

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
