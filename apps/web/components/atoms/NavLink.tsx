'use client';

import { Link as UILink } from '@jovie/ui';
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
    // Renders through the canonical Link primitive (asChild + variant={null})
    // instead of borrowing buttonVariants for an anchor. These classes
    // preserve the legacy appearance: ghost/primary button styling at size sm
    // with the chrome neutralized (h-auto px-0 py-0), plus the hover/active
    // and focus treatments the override layer used to win via cascade order.
    const baseStyles = cn(
      'h-auto rounded-md px-0 py-0 text-sm font-medium',
      'focus-visible:text-primary-token focus-visible:ring-interactive focus-visible:ring-offset-background',
      variant === 'primary'
        ? 'border border-(--linear-btn-primary-border) bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--linear-btn-primary-hover) hover:bg-(--linear-btn-primary-hover)'
        : 'text-muted-foreground hover:text-foreground hover:bg-interactive-hover active:bg-interactive-active',
      className
    );

    const isExternal = external ?? isExternalUrl(href);

    return (
      <UILink asChild variant={null} className={baseStyles}>
        <Link
          ref={ref}
          href={href}
          prefetch={prefetch}
          {...getExternalLinkProps(isExternal)}
          {...props}
        >
          <span className='inline-flex items-center gap-2'>{children}</span>
        </Link>
      </UILink>
    );
  }
);

NavLink.displayName = 'NavLink';
