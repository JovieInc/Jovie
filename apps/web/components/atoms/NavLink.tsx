'use client';

import { Button, Link as UILink } from '@jovie/ui';
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

// Shared appearance overrides: the legacy ghost/primary-at-size-sm styling
// with the chrome neutralized (h-auto px-0 py-0), plus the focus treatment
// the override layer used to win via cascade order.
const NAV_LINK_CHROME_CLASSES =
  'h-auto rounded-md px-0 py-0 text-sm font-medium focus-visible:text-primary-token focus-visible:ring-interactive focus-visible:ring-offset-background';

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

    const anchor = (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch}
        {...getExternalLinkProps(isExternal)}
        {...props}
      >
        <span className='inline-flex items-center gap-2'>{children}</span>
      </Link>
    );

    if (variant === 'primary') {
      // Button-styled nav CTA: Button owns the primary visual contract
      // (asChild), the canonical Link primitive composes the Next.js anchor
      // underneath it — same Slot chain as FrostedButton. `static` keeps the
      // legacy no-press-scale behavior. Do NOT inline buttonVariants' primary
      // classes here: duplicating their --linear-* token references grows the
      // shrink-only linear-namespace ratchet (JOV #12009).
      return (
        <Button
          asChild
          static
          variant='primary'
          size='sm'
          className={cn(NAV_LINK_CHROME_CLASSES, className)}
        >
          <UILink asChild variant={null}>
            {anchor}
          </UILink>
        </Button>
      );
    }

    // Renders through the canonical Link primitive (asChild + variant={null})
    // instead of borrowing buttonVariants for an anchor; the classes preserve
    // the legacy ghost-derived hover/active appearance.
    return (
      <UILink
        asChild
        variant={null}
        className={cn(
          NAV_LINK_CHROME_CLASSES,
          'text-muted-foreground hover:text-foreground hover:bg-interactive-hover active:bg-interactive-active',
          className
        )}
      >
        {anchor}
      </UILink>
    );
  }
);

NavLink.displayName = 'NavLink';
