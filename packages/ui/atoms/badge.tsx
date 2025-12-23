import { cn } from '@jovie/ui/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-full border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500/50',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-btn-primary text-btn-primary-foreground',
        secondary: 'border-transparent bg-surface-2 text-primary-token',
        outline:
          'border-border bg-transparent text-primary-token hover:bg-surface-1',
        success:
          'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        warning:
          'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        error: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
        info: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
      },
      size: {
        sm: 'h-5 px-2 text-xs',
        md: 'h-6 px-2.5 text-sm',
        lg: 'h-7 px-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Icon element to render before the badge text */
  startIcon?: React.ReactNode;
  /** Icon element to render after the badge text */
  endIcon?: React.ReactNode;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant, size, startIcon, endIcon, children, ...props },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {startIcon && (
          <span className='shrink-0' aria-hidden='true'>
            {startIcon}
          </span>
        )}
        {children}
        {endIcon && (
          <span className='shrink-0' aria-hidden='true'>
            {endIcon}
          </span>
        )}
      </span>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
