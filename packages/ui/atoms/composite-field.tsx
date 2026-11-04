'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export type CompositeFieldShape = 'pill' | 'md';
export type CompositeFieldSize = 'sm' | 'md';
export type CompositeFieldSurface = 'none' | 'page' | 'shell' | 'field';

export interface CompositeFieldProps
  extends React.ComponentPropsWithoutRef<'div'> {
  /**
   * Container radius. The focus ring follows it, so the ring and the field
   * always share one silhouette.
   */
  readonly shape?: CompositeFieldShape;
  /** Control height, padding and gap. */
  readonly size?: CompositeFieldSize;
  /**
   * Resting border + fill, owned by globals.css (`.composite-field`).
   * `none` when a parent frame (for example the homepage aura rim) draws it.
   */
  readonly surface?: CompositeFieldSurface;
}

const shapeClasses = {
  pill: 'rounded-full',
  md: 'rounded-lg',
} satisfies Record<CompositeFieldShape, string>;

const sizeClasses = {
  sm: 'h-app-control-sm gap-1.5',
  md: 'min-h-12 gap-2 py-2 pr-2 pl-4',
} satisfies Record<CompositeFieldSize, string>;

/**
 * CompositeField is the one owner of focus treatment for any field made of an
 * input plus adjacent parts: a prefix ("jov.ie/"), a suffix, a status icon, a
 * submit button, a search pill, a chat composer.
 *
 * The container draws the focus ring (`:has(:focus-visible)` on the text control,
 * token-based, radius following), and any native input/textarea/select inside has its own outline,
 * ring and shadow removed so the browser's square default can never show inside
 * a rounded container. The guard `apps/web/scripts/lint-composite-field.mjs` requires
 * this primitive wherever an input drops its own focus treatment.
 *
 * @example
 * ```tsx
 * <CompositeField shape='pill'>
 *   <span>jov.ie/</span>
 *   <input aria-label='Handle' />
 *   <Button>Claim</Button>
 * </CompositeField>
 * ```
 */
export const CompositeField = React.forwardRef<
  HTMLDivElement,
  CompositeFieldProps
>(function CompositeField(
  {
    children,
    className,
    shape = 'pill',
    size = 'md',
    surface = 'none',
    ...props
  },
  ref
) {
  return (
    <div
      ref={ref}
      data-component='composite-field'
      data-shape={shape}
      data-size={size}
      data-surface={surface}
      className={cn(
        'relative flex min-w-0 items-center',
        shapeClasses[shape],
        sizeClasses[size],
        'transition-colors duration-subtle ease-subtle motion-reduce:transition-none',
        // Focus ring + inner-control reset live in globals.css (.composite-field):
        // token-based, radius following, no arbitrary values here.
        'composite-field',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
