'use client';

import { buttonVariants } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface NavLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  readonly href: string;
  readonly className?: string;
  readonly variant?: 'default' | 'primary';
  readonly external?: boolean;
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

    // Improved external detection: check if href origin differs from current origin
    let isExternal = external;
    if (isExternal === undefined) {
      try {
        const currentHref = globalThis.location?.href ?? 'http://localhost';
        const url = new URL(href, currentHref);
        const currentOrigin = globalThis.location?.origin;
        isExternal = currentOrigin !== undefined && url.origin !== currentOrigin;
      } catch {
        // If URL parsing fails (e.g., relative path), it's not external
        isExternal = false;
      }
    }

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
