'use client';

import { cn } from '@jovie/ui/lib/utils';
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
        ],
        subtle: [
          'text-(--linear-text-secondary) hover:text-(--color-link-hover) hover:underline',
          'visited:text-(--color-link-visited)',
        ],
        inline: [
          'text-primary-token underline decoration-(--linear-border-default) hover:decoration-(--color-link-hover)',
          'visited:text-(--color-link-visited) visited:decoration-(--color-link-visited)',
        ],
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
   * Marks the link as visited for Storybook/docs parity when pseudo-class
   * preview is unavailable. Does not replace the native :visited selector.
   */
  readonly visited?: boolean;
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ className, variant, visited, ...props }, ref) => {
    return (
      <a
        ref={ref}
        data-variant='link'
        data-state={visited ? 'visited' : 'idle'}
        className={cn(linkVariants({ variant, className }))}
        {...props}
      />
    );
  }
);
Link.displayName = 'Link';

export { Link, linkVariants };
