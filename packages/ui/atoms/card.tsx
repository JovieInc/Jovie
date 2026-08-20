'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const cardVariants = cva(
  'rounded-(--system-b-radius-card) border border-subtle bg-surface-1 text-primary-token shadow-card transition-[background-color,border-color,box-shadow] duration-subtle ease-subtle motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default: '',
        hoverable:
          'cursor-pointer hover:border-default hover:bg-surface-2 hover:shadow-card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type CardContentState = 'default' | 'partial' | 'offline';

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  readonly asChild?: boolean;
  /**
   * Compose Card's polymorphic root without applying canonical chrome.
   * Reserved for compatibility adapters that already own a stable visual
   * contract and are migrating to the canonical Card substrate incrementally.
   */
  readonly unstyled?: boolean;
  /**
   * Async/partial content state for data-backed cards.
   */
  readonly contentState?: CardContentState;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant,
      asChild = false,
      unstyled = false,
      contentState = 'default',
      'aria-busy': ariaBusy,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'div';
    const resolvedVariant = variant ?? 'default';

    return (
      <Comp
        {...props}
        ref={ref}
        data-content-state={
          contentState === 'default' ? undefined : contentState
        }
        data-variant={unstyled ? undefined : resolvedVariant}
        aria-busy={contentState === 'partial' ? true : ariaBusy}
        className={
          unstyled
            ? className
            : cn(
                cardVariants({ variant: resolvedVariant, className }),
                contentState === 'partial' &&
                  'opacity-[var(--state-partial-opacity)] saturate-75'
              )
        }
      />
    );
  }
);
Card.displayName = 'Card';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly asChild?: boolean;
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';

    return (
      <Comp
        ref={ref}
        className={cn('flex flex-col space-y-1.5 p-6', className)}
        {...props}
      />
    );
  }
);
CardHeader.displayName = 'CardHeader';

export interface CardTitleProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  readonly asChild?: boolean;
  /**
   * Truncate overflowing titles to a single line.
   */
  readonly truncate?: boolean;
  /**
   * Clamp long titles to N lines (2 or 3). Ignored when truncate is true.
   */
  readonly maxLines?: 2 | 3;
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  (
    { className, asChild = false, truncate = false, maxLines, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : 'h3';
    const isLongContent = truncate || maxLines !== undefined;

    return (
      <Comp
        ref={ref}
        data-content-length={isLongContent ? 'long' : undefined}
        className={cn(
          'text-base font-semibold leading-none tracking-tight text-primary-token',
          truncate && 'truncate',
          maxLines === 2 && 'line-clamp-2 leading-snug',
          maxLines === 3 && 'line-clamp-3 leading-snug',
          className
        )}
        {...props}
      />
    );
  }
);
CardTitle.displayName = 'CardTitle';

export interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  readonly asChild?: boolean;
}

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'p';

  return (
    <Comp
      ref={ref}
      className={cn('text-[13px] text-secondary-token', className)}
      {...props}
    />
  );
});
CardDescription.displayName = 'CardDescription';

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly asChild?: boolean;
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';

    return <Comp ref={ref} className={cn('p-6 pt-2', className)} {...props} />;
  }
);
CardContent.displayName = 'CardContent';

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly asChild?: boolean;
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div';

    return (
      <Comp
        ref={ref}
        className={cn('flex items-center p-6 pt-0', className)}
        {...props}
      />
    );
  }
);
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
};
