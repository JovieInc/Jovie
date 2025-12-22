'use client';

import { buttonVariants } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface NavLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  href: string;
  className?: string;
  variant?: 'default' | 'primary';
  external?: boolean;
}

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  (
    {
      href,
      className,
      children,
      variant = 'default',
      external,
      prefetch,
      ...props
    },
    ref
  ) => {
    const baseStyles = buttonVariants({
      variant: variant === 'primary' ? 'primary' : 'ghost',
      size: 'sm',
      className: cn(
        'h-auto px-0 py-0 text-sm font-medium transition-colors',
        'hover:text-primary-token focus-visible:text-primary-token',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'rounded-md',
        variant === 'default' && 'text-muted-foreground hover:text-foreground',
        className
      ),
    });

    const isExternal = external ?? /^https?:\/\//.test(href);

    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch}
        className={baseStyles}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        {...props}
      >
        <span className='inline-flex items-center gap-2'>{children}</span>
      </Link>
    );
  }
);

NavLink.displayName = 'NavLink';
