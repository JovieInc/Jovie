import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-btn-primary text-btn-primary-foreground shadow hover:bg-btn-primary/90',
        destructive: 'bg-red-500 text-white shadow-sm hover:bg-red-500/90',
        outline:
          'border border-border bg-transparent shadow-sm hover:bg-surface-1 hover:text-primary-token',
        secondary:
          'bg-surface-2 text-primary-token shadow-sm hover:bg-surface-3',
        ghost: 'hover:bg-surface-2 hover:text-primary-token',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /**
   * For icon-only buttons, provide descriptive text for screen readers
   */
  'aria-label'?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;
    const isIconOnly = size === 'icon';

    // Warn if icon-only button doesn't have aria-label
    if (
      process.env.NODE_ENV === 'development' &&
      isIconOnly &&
      !ariaLabel &&
      !props['aria-labelledby']
    ) {
      console.warn(
        'Button: Icon-only buttons should have an aria-label for accessibility'
      );
    }

    const buttonProps = {
      className: cn(buttonVariants({ variant, size }), className),
      'aria-disabled': isDisabled || undefined,
      'aria-busy': loading || undefined,
      'aria-label': ariaLabel,
      'data-state': loading ? 'loading' : isDisabled ? 'disabled' : 'idle',
      ...props,
    };

    if (asChild) {
      return (
        <Comp ref={ref} {...buttonProps}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        {...buttonProps}
        disabled={isDisabled}
        type={props.type ?? 'button'}
      >
        {loading && (
          <div
            className='absolute inset-0 flex items-center justify-center'
            data-testid='spinner'
            aria-hidden='true'
          >
            <div className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none' />
          </div>
        )}
        <span className={cn(loading && 'opacity-0', 'flex items-center gap-2')}>
          {children}
        </span>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
