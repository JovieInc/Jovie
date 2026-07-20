'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const linkVariants = cva(
  [
    'inline-flex items-center gap-1 text-[13px] font-[510] tracking-normal underline-offset-4 transition-colors duration-normal ease-interactive',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
    'rounded-sm',
  ],
  {
    variants: {
      variant: {
        default: [
          'text-(--color-link-default) hover:text-(--color-link-hover) hover:underline',
          'visited:text-(--color-link-visited)',
          'active:text-(--color-accent) data-[state=active]:text-(--color-accent)',
        ],
        subtle: [
          'text-(--linear-text-secondary) hover:text-(--color-link-hover) hover:underline',
          'visited:text-(--color-link-visited)',
          'active:text-(--color-accent) data-[state=active]:text-(--color-accent)',
        ],
        inline: [
          'text-primary-token underline decoration-(--linear-border-default) hover:decoration-(--color-link-hover)',
          'visited:text-(--color-link-visited) visited:decoration-(--color-link-visited)',
          'active:text-(--color-accent) active:decoration-(--color-accent) data-[state=active]:text-(--color-accent) data-[state=active]:decoration-(--color-accent)',
        ],
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Disabled visuals use the shared state tokens (state-matrix: never rely on
 * opacity alone). Applied conditionally because anchors never match :disabled.
 */
const LINK_DISABLED_CLASSES =
  'pointer-events-none text-(--color-text-disabled-token) opacity-[var(--state-disabled-opacity)]';

export interface LinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof linkVariants> {
  /**
   * Compose link styling and behavior onto a single child element (Radix
   * Slot). This is how apps keep Next.js `<Link>` client-side navigation:
   * `<Link asChild><NextLink href='/x'>…</NextLink></Link>`.
   */
  readonly asChild?: boolean;
  /**
   * Forces the active/pressed state (e.g. aria-current page, Storybook
   * parity). Mirrors `data-state='active'`; native `:active` keeps working.
   */
  readonly active?: boolean;
  /**
   * Marks the link as inert: `aria-disabled`, disabled-visual state tokens,
   * and `pointer-events-none`. Anchors do not support the `disabled`
   * attribute, so this mirrors the Button asChild disabled pattern.
   */
  readonly disabled?: boolean;
  /**
   * Marks the link as visited for Storybook/docs parity when pseudo-class
   * preview is unavailable. Does not replace the native :visited selector.
   */
  readonly visited?: boolean;
}

function getLinkDataState({
  disabled,
  active,
  visited,
}: {
  readonly disabled: boolean;
  readonly active: boolean;
  readonly visited: boolean;
}): 'disabled' | 'active' | 'visited' | 'idle' {
  if (disabled) return 'disabled';
  if (active) return 'active';
  if (visited) return 'visited';
  return 'idle';
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      className,
      variant,
      asChild = false,
      active = false,
      disabled = false,
      visited = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'a';
    return (
      <Comp
        ref={ref}
        data-variant='link'
        data-state={getLinkDataState({ disabled, active, visited })}
        aria-disabled={disabled || undefined}
        className={cn(
          linkVariants({ variant, className }),
          disabled && LINK_DISABLED_CLASSES
        )}
        {...props}
      />
    );
  }
);
Link.displayName = 'Link';

export { Link, linkVariants };
