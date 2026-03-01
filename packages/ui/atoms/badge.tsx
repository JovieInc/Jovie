import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-xs)] border font-[510] transition-colors',
  {
    variants: {
      variant: {
        primary:
          'bg-btn-primary text-btn-primary-foreground border-transparent',
        secondary:
          'bg-[var(--color-badge-bg)] text-[var(--color-badge-text)] border-[var(--color-badge-border)]',
        success:
          'border-success/20 bg-success-subtle text-success dark:text-success-foreground',
        warning:
          'border-warning/20 bg-warning-subtle text-warning dark:text-warning-foreground',
        error:
          'border-error/20 bg-error-subtle text-error dark:text-error-foreground',
      },
      size: {
        sm: 'px-1.5 py-0 text-[10px] leading-[18px]',
        md: 'px-2 py-0 text-[11px] leading-[20px]',
        lg: 'px-2.5 py-0.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
