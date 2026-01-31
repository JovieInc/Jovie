'use client';

import Link from 'next/link';
import React from 'react';
import { cn, getExternalLinkProps, isExternalUrl } from '@/lib/utils';

export interface FooterLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  readonly href: string;
  readonly className?: string;
  readonly tone?: 'light' | 'dark';
  readonly external?: boolean;
}

export const FooterLink = React.forwardRef<HTMLAnchorElement, FooterLinkProps>(
  (
    { href, tone = 'dark', className, children, external, prefetch, ...props },
    ref
  ) => {
    const isExternal = external ?? isExternalUrl(href);
    const palette =
      tone === 'light'
        ? 'text-secondary-token hover:text-primary-token hover:bg-surface-1'
        : 'text-white/70 hover:text-white hover:bg-white/5';

    const linkClassName = cn(
      'inline-flex items-center rounded-md px-2 py-1 -mx-2 -my-1',
      'text-[13px] leading-5 font-medium tracking-[-0.01em]',
      'transition-all duration-150 ease-out',
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
        {...getExternalLinkProps(isExternal)}
        {...props}
      >
        <span className='inline-flex items-center gap-2'>{children}</span>
      </Link>
    );
  }
);

FooterLink.displayName = 'FooterLink';
