'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import { cn } from '@jovie/ui/lib/utils';
import Link from 'next/link';
import React from 'react';

interface NavLinkProps
  extends Omit<ButtonProps, 'children' | 'variant' | 'size' | 'asChild'> {
  href: string;
  children: React.ReactNode;
  variant?: 'default' | 'primary';
  prefetch?: boolean;
  external?: boolean;
}

const navVariantMap = {
  default: {
    variant: 'ghost' as ButtonProps['variant'],
    size: 'sm' as ButtonProps['size'],
    className:
      'h-auto px-0 py-0 text-sm text-secondary-token hover:text-primary-token dark:text-white/70 dark:hover:text-white',
  },
  primary: {
    variant: 'primary' as ButtonProps['variant'],
    size: 'sm' as ButtonProps['size'],
    className: 'text-sm font-semibold shadow-sm hover:shadow-md',
  },
} as const;

/**
 * Navigation link styled with @jovie/ui button primitives.
 */
export function NavLink({
  href,
  children,
  className,
  variant = 'default',
  prefetch,
  external = false,
  ...props
}: NavLinkProps) {
  const config = navVariantMap[variant];

  const computedClassName = cn(
    'inline-flex items-center gap-2 whitespace-nowrap transition-colors',
    config.className,
    className
  );

  if (external) {
    return (
      <Button
        asChild
        className={computedClassName}
        size={config.size}
        variant={config.variant}
        {...props}
      >
        <a href={href} rel='noopener noreferrer' target='_blank'>
          {children}
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      className={computedClassName}
      size={config.size}
      variant={config.variant}
      {...props}
    >
      <Link href={href} prefetch={prefetch}>
        {children}
      </Link>
    </Button>
  );
}
