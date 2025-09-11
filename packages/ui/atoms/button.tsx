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
        primary:
          'bg-btn-primary text-btn-primary-foreground hover:bg-btn-primary/90',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
        secondary: 'bg-surface-2 text-primary-token hover:bg-surface-3',
        ghost: 'hover:bg-surface-2',
        outline: 'border border-border bg-transparent hover:bg-surface-1',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

type CommonProps = {
  loading?: boolean;
  disabled?: boolean;
  'data-testid'?: string;
} & VariantProps<typeof buttonVariants>;

type ButtonAsButtonProps = {
  asChild?: false;
  href?: undefined;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  CommonProps;

type ButtonAsAnchorProps = {
  asChild?: false;
  href: string;
} & React.AnchorHTMLAttributes<HTMLAnchorElement> &
  CommonProps;

type ButtonAsChildProps = {
  asChild: true;
  href?: string;
} & React.HTMLAttributes<HTMLElement> &
  CommonProps;

export type ButtonProps =
  | ButtonAsButtonProps
  | ButtonAsAnchorProps
  | ButtonAsChildProps;

const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      href,
      disabled,
      'data-testid': dataTestId,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = (asChild ? Slot : href ? 'a' : 'button') as React.ElementType;
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref as React.Ref<HTMLElement>}
        className={cn(
          buttonVariants({ variant, size, className }),
          isDisabled && 'pointer-events-none'
        )}
        data-testid={dataTestId ?? 'button'}
        href={Comp === 'a' && !isDisabled ? href : undefined}
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
        {loading && (
          <span
            className='absolute inset-0 flex items-center justify-center'
            data-testid='spinner'
          >
            <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
          </span>
        )}
        <span className={loading ? 'opacity-0' : 'opacity-100'}>
          {children}
        </span>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
