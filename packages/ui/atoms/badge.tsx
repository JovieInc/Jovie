import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-[510] tracking-[-0.006em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/30 focus-visible:ring-offset-1',
  {
    variants: {
      variant: {
        default:
          'bg-(--color-bg-primary) text-(--linear-text-primary) border border-(--color-border-strong)',
        secondary:
          'bg-(--color-bg-primary) text-(--linear-text-tertiary) border border-(--color-border-strong)',
        destructive: 'bg-(--linear-error)/15 text-(--linear-error)',
        outline:
          'border border-(--color-border-default) text-(--linear-text-secondary) bg-transparent',
        success: 'bg-(--linear-success)/15 text-(--linear-success)',
        warning: 'bg-(--linear-warning)/15 text-(--linear-warning)',
        // Backwards-compat aliases
        primary:
          'bg-(--color-bg-primary) text-(--linear-text-primary) border border-(--color-border-strong)',
        error: 'bg-(--linear-error)/15 text-(--linear-error)',
      },
      size: {
        sm: 'px-1.5 py-0 text-[10px] leading-[18px]',
        md: 'px-2 py-0.5 text-[12px] leading-[20px]',
        lg: 'px-2.5 py-0.5 text-xs',
        xl: 'px-3 py-1 text-xs',
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
