'use client';

import { Button, type ButtonProps, Link as UILink } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

// @coverage-via apps/web/tests/unit/atoms/FrostedButton.test.tsx

export interface FrostedButtonProps extends Omit<ButtonProps, 'variant'> {
  readonly href?: string;
  readonly external?: boolean;
  readonly tone?: 'solid' | 'ghost' | 'outline';
  readonly prefetch?: boolean;
}

const toneToVariant: Record<
  NonNullable<FrostedButtonProps['tone']>,
  ButtonProps['variant']
> = {
  solid: 'secondary',
  ghost: 'ghost',
  outline: 'secondary',
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
    // JOV-4871: no bespoke focus ring — the base Button canonical ring and
    // reduced-motion policy apply unchanged.
    const frostedClasses = cn(
      'backdrop-blur-md transition-colors duration-subtle ease-out',
      'motion-reduce:transition-none',
      className
    );

    if (href) {
      // Button owns the visual contract (asChild); the canonical Link
      // primitive composes the Next.js anchor underneath it (Radix Slot
      // chain: Button -> UILink -> next/link).
      return (
        <Button asChild variant={variant} className={frostedClasses} {...props}>
          <UILink asChild variant={null}>
            <Link
              ref={ref as React.Ref<HTMLAnchorElement>}
              href={href}
              prefetch={prefetch}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
            >
              {children}
            </Link>
          </UILink>
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
