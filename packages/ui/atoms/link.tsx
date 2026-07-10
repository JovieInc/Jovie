'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

/**
 * Canonical link primitive (JOV-3574).
 *
 * States (all tokenized):
 * - default, hover, focus-visible, active, visited, disabled
 *
 * Compose with Next.js via `asChild`:
 *   <Link asChild variant="default"><NextLink href="/docs">Docs</NextLink></Link>
 */
const linkVariants = cva(
  [
    'inline-flex items-center gap-1 text-[13px] font-[510] tracking-normal underline-offset-4',
    'transition-colors duration-normal ease-interactive',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
    'rounded-sm',
    'active:opacity-80',
    'disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)] disabled:text-(--color-text-disabled-token)',
    'aria-disabled:pointer-events-none aria-disabled:opacity-[var(--state-disabled-opacity)] aria-disabled:text-(--color-text-disabled-token)',
  ],
  {
    variants: {
      variant: {
        default: [
          'text-(--color-link-default) hover:text-(--color-link-hover) hover:underline',
          'visited:text-(--color-link-visited)',
          'active:text-(--color-link-hover)',
        ],
        subtle: [
          'text-(--linear-text-secondary) hover:text-(--color-link-hover) hover:underline',
          'visited:text-(--color-link-visited)',
          'active:text-(--color-link-hover)',
        ],
        inline: [
          'text-primary-token underline decoration-(--linear-border-default) hover:decoration-(--color-link-hover)',
          'visited:text-(--color-link-visited) visited:decoration-(--color-link-visited)',
          'active:decoration-(--color-link-hover)',
        ],
        /**
         * Interaction shell only — for CTA/nav anchors that own their own
         * surface colors (ShellCtaButton, FrostedButton). Still carries
         * focus-visible, active, disabled, and data-state contract.
         */
        bare: ['no-underline'],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  /**
   * Render as the child element (Radix Slot). Use with Next.js `<Link>`:
   * `<Link asChild href={undefined}><NextLink href="...">…</NextLink></Link>`.
   */
  readonly asChild?: boolean;
  /**
   * Marks the link as visited for Storybook/docs parity when pseudo-class
   * preview is unavailable. Does not replace the native :visited selector.
   */
  readonly visited?: boolean;
  /**
   * Disabled visual + interaction state. Prefer `aria-disabled` for anchors
   * that must remain in the tab order for a11y messaging.
   */
  readonly disabled?: boolean;
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      className,
      variant,
      visited,
      asChild = false,
      disabled = false,
      onClick,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'a';
    const dataState = disabled ? 'disabled' : visited ? 'visited' : 'idle';

    return (
      <Comp
        ref={ref}
        data-variant='link'
        data-state={dataState}
        aria-disabled={disabled || undefined}
        className={cn(linkVariants({ variant }), className)}
        onClick={
          disabled
            ? (event: React.MouseEvent<HTMLAnchorElement>) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : onClick
        }
        {...props}
      />
    );
  }
);
Link.displayName = 'Link';

export { Link, linkVariants };
