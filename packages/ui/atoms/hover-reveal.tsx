'use client';

// @coverage-via packages/ui/atoms/hover-reveal.interaction.test.tsx

import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export interface HoverRevealProps extends ComponentProps<'span'> {
  /** Reuse the child's box rather than adding layout geometry. */
  readonly asChild?: boolean;
  readonly group?: 'row' | 'toolbar-filters';
  /** Controlled engagement, including selected rows and portalled menus. */
  readonly engaged?: boolean;
  /** Complementary row-number layer underneath a checkbox. */
  readonly inverse?: boolean;
}

/**
 * Secondary controls keep their box and tab stop at rest. The owning `group`
 * (or `group/toolbar-filters`) reveals them on hover/focus-within. Focus,
 * pressing, and an open descendant menu retain visibility after pointer exit.
 * Use `engaged` for state owned outside the subtree, such as a portal.
 */
export function HoverReveal({
  asChild = false,
  group = 'row',
  engaged = false,
  inverse = false,
  className,
  ...props
}: HoverRevealProps) {
  const Component = asChild ? Slot : 'span';
  return (
    <Component
      data-slot='hover-reveal'
      {...props}
      className={cn(
        'transition-opacity duration-subtle ease-subtle motion-reduce:transition-none',
        inverse
          ? 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0'
          : 'opacity-0 focus-within:opacity-100 active:opacity-100 aria-expanded:opacity-100 aria-pressed:opacity-100 has-aria-expanded:opacity-100 has-aria-pressed:opacity-100 has-active:opacity-100',
        !inverse &&
          (group === 'toolbar-filters'
            ? 'group-hover/toolbar-filters:opacity-100 group-focus-within/toolbar-filters:opacity-100'
            : 'group-hover:opacity-100 group-focus-within:opacity-100'),
        engaged && (inverse ? 'opacity-0' : 'opacity-100'),
        className
      )}
    />
  );
}
