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
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200',
        warning:
          'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-200',
        error: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-200',
      },
      size: {
        sm: 'px-2 py-0 text-[10px] leading-[20px]',
        md: 'px-2 py-0 text-[11px] leading-[20px]',
        lg: 'px-3 py-0.5 text-xs',
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
