'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface FrostedButtonProps extends Omit<ButtonProps, 'variant'> {
  href?: string;
  external?: boolean;
  tone?: 'solid' | 'ghost' | 'outline';
  prefetch?: boolean;
}

const toneToVariant: Record<
  NonNullable<FrostedButtonProps['tone']>,
  ButtonProps['variant']
> = {
  solid: 'frosted',
  ghost: 'frosted-ghost',
  outline: 'frosted-outline',
};

export const FrostedButton = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  FrostedButtonProps
>(
  (
    { href, external, tone = 'solid', className, prefetch, children, ...props },
    ref
  ) => {
    const variant = toneToVariant[tone];
    const frostedClasses = cn(
      'backdrop-blur-md transition-all duration-200 ease-out',
      'active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none',
      'focus-visible:ring-offset-2 focus-visible:ring-ring focus-visible:ring-offset-background',
      className
    );

    if (href) {
      return (
        <Button asChild variant={variant} className={frostedClasses} {...props}>
          <Link
            ref={ref as React.Ref<HTMLAnchorElement>}
            href={href}
            prefetch={prefetch}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
          >
            {children}
          </Link>
        </Button>
      );
    }

    return (
      <Button
        ref={ref as React.Ref<HTMLButtonElement>}
        variant={variant}
        className={frostedClasses}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

FrostedButton.displayName = 'FrostedButton';
