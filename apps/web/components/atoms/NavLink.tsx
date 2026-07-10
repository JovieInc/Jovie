'use client';

import { linkVariants, Link as UiLink } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn, getExternalLinkProps, isExternalUrl } from '@/lib/utils';

export interface NavLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  readonly href: string;
  readonly className?: string;
  readonly variant?: 'default' | 'primary';
  readonly external?: boolean;
}

/**
 * App nav link built on the canonical `@jovie/ui` Link primitive (JOV-3574).
 * Does not borrow buttonVariants for anchors.
 */
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
    const isExternal = external ?? isExternalUrl(href);
    const classes = cn(
      linkVariants({
        variant: variant === 'primary' ? 'default' : 'subtle',
      }),
      'h-auto px-0 py-0 text-sm font-medium',
      variant === 'primary' &&
        'text-(--color-link-default) hover:text-(--color-link-hover)',
      variant === 'default' && 'text-muted-foreground hover:text-foreground',
      className
    );

    return (
      <UiLink asChild className={classes} {...getExternalLinkProps(isExternal)}>
        <Link ref={ref} href={href} prefetch={prefetch} {...props}>
          <span className='inline-flex items-center gap-2'>{children}</span>
        </Link>
      </UiLink>
    );
  }
);

NavLink.displayName = 'NavLink';
