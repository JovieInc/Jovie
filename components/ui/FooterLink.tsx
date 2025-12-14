'use client';

import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface FooterLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  href: string;
  className?: string;
  tone?: 'light' | 'dark';
  external?: boolean;
}

export const FooterLink = React.forwardRef<HTMLAnchorElement, FooterLinkProps>(
  (
    { href, tone = 'dark', className, children, external, prefetch, ...props },
    ref
  ) => {
    const isExternal = external ?? /^https?:\/\//.test(href);
    const palette =
      tone === 'light'
        ? 'text-secondary-token hover:text-primary-token'
        : 'text-white/70 hover:text-white';

    const linkClassName = cn(
      'inline-flex items-center rounded-md px-0 py-0 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
      palette,
      className
    );

    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch}
        className={linkClassName}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        {...props}
      >
        <span className='inline-flex items-center gap-2'>{children}</span>
      </Link>
    );
  }
);

FooterLink.displayName = 'FooterLink';
