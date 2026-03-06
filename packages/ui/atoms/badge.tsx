import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[510] tracking-[-0.006em] transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-(--linear-bg-surface-2) text-(--linear-text-secondary) border border-(--linear-border-subtle)',
        secondary:
          'bg-(--linear-bg-surface-1) text-(--linear-text-tertiary) border border-(--linear-border-subtle)',
        destructive: 'bg-(--linear-error)/15 text-(--linear-error)',
        outline:
          'border border-(--linear-border-default) text-(--linear-text-secondary) bg-transparent',
        success: 'bg-(--linear-success)/15 text-(--linear-success)',
        warning: 'bg-(--linear-warning)/15 text-(--linear-warning)',
        // Backwards-compat aliases
        primary:
          'bg-(--linear-bg-surface-2) text-(--linear-text-secondary) border border-(--linear-border-subtle)',
        error: 'bg-(--linear-error)/15 text-(--linear-error)',
      },
      size: {
        sm: 'px-1.5 py-0 text-[10px] leading-[18px]',
        md: 'px-2 py-0.5 text-[11px] leading-[20px]',
        lg: 'px-2.5 py-0.5 text-xs',
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
