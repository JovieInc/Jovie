'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        // Core variants
        primary:
          'bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        secondary: 'bg-surface-1 text-primary-token hover:bg-surface-2',
        ghost: 'hover:bg-surface-2',
        outline: 'border border-border bg-transparent hover:bg-surface-1',
        // Destructive variant
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Link variant
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
        // Frosted glass variants (glassmorphism) - using design tokens
        frosted:
          'backdrop-blur-sm bg-surface-0/60 dark:bg-surface-1/30 hover:bg-surface-1/80 dark:hover:bg-surface-2/40 border border-subtle',
        'frosted-ghost':
          'backdrop-blur-sm bg-surface-0/30 dark:bg-surface-1/10 hover:bg-surface-1/50 dark:hover:bg-surface-2/20 border border-subtle',
        'frosted-outline':
          'backdrop-blur-sm bg-transparent border border-subtle hover:bg-surface-1/20 dark:hover:bg-surface-2/10',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-8 text-base',
        icon: 'h-10 w-10',
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
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;

    // In asChild mode (Radix Slot), React.Children.only requires a single child.
    // Do NOT render additional wrappers/spinner here; apply styles/props to the child.
    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(
            buttonVariants({ variant, size, className }),
            isDisabled && 'pointer-events-none'
          )}
          aria-disabled={isDisabled || undefined}
          aria-busy={loading || undefined}
          data-state={loading ? 'loading' : isDisabled ? 'disabled' : 'idle'}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    // Normal button/anchor rendering with optional loading spinner and content opacity
    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size, className }),
          isDisabled && 'pointer-events-none'
        )}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        data-state={loading ? 'loading' : isDisabled ? 'disabled' : 'idle'}
        {...(Comp === 'button'
          ? {
              disabled: isDisabled,
              type:
                (props as React.ButtonHTMLAttributes<HTMLButtonElement>).type ??
                'button',
            }
          : {})}
        {...props}
      >
        {Comp === 'button' ? (
          <>
            {loading && (
              <span
                className='absolute inset-0 flex items-center justify-center'
                data-testid='spinner'
              >
                <span className='h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent' />
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center',
                loading ? 'opacity-0' : 'opacity-100'
              )}
            >
              {children}
            </span>
          </>
        ) : // asChild case (Slot) — must render exactly one element child
        React.isValidElement(children) ? (
          children
        ) : (
          <span
            className={cn(
              'inline-flex items-center',
              loading ? 'opacity-0' : 'opacity-100'
            )}
          >
            {children}
          </span>
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
