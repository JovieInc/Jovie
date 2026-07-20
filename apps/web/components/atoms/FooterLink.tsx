import { Link as UILink } from '@jovie/ui';
import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export interface FooterLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'href' | 'className'> {
  readonly href: string;
  readonly className?: string;
  readonly tone?: 'light' | 'dark';
  readonly external?: boolean;
}

export const FooterLink = React.forwardRef<HTMLAnchorElement, FooterLinkProps>(
  (
    {
      href,
      tone = 'dark',
      className,
      children,
      external,
      prefetch,
      target: propsTarget,
      rel: propsRel,
      ...props
    },
    ref
  ) => {
    const isExternal = external ?? /^https?:\/\//.test(href);

    // Enforce security: external links must use _blank and noopener noreferrer
    const resolvedTarget = isExternal ? '_blank' : propsTarget;
    const resolvedRel = isExternal
      ? Array.from(
          new Set([
            ...(propsRel ?? '').split(/\s+/).filter(Boolean),
            'noopener',
            'noreferrer',
          ])
        ).join(' ')
      : propsRel;

    // Use semantic tokens for proper dark mode support
    const palette =
      tone === 'light'
        ? 'text-secondary-token hover:text-primary-token hover:bg-surface-1'
        : 'text-white/70 hover:text-white hover:bg-white/5';

    // Renders through the canonical Link primitive (asChild + variant={null}).
    // The primitive base supplies inline-flex, transition-colors, and the
    // focus-visible ring; these classes preserve the existing footer-link
    // appearance (padding hit area, text-app sizing, tone palette, and the
    // subtle duration/easing, which win over the base timing in the cascade).
    const linkClassName = cn(
      'rounded-md px-2 py-1 -mx-2 -my-1',
      'text-app leading-5 font-medium tracking-tight',
      'duration-subtle ease-out',
      'focus-visible:ring-interactive focus-visible:ring-offset-transparent',
      palette,
      className
    );

    return (
      <UILink asChild variant={null} className={linkClassName}>
        <Link
          ref={ref}
          href={href}
          prefetch={prefetch}
          target={resolvedTarget}
          rel={resolvedRel}
          {...props}
        >
          <span className='inline-flex items-center gap-2'>{children}</span>
        </Link>
      </UILink>
    );
  }
);

FooterLink.displayName = 'FooterLink';
