'use client';

import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';
import { IconButton, type IconButtonProps } from './icon-button';

export interface OverflowMenuTriggerProps
  extends Omit<
    IconButtonProps,
    'ariaLabel' | 'asChild' | 'children' | 'size' | 'variant'
  > {
  /** Whether the active tab is hidden in the overflow menu */
  readonly hasActiveOverflow?: boolean;
  /** Retained for TabBar API compatibility; both contexts use one atom. */
  readonly variant?: 'drawer' | 'segment';
}

/**
 * Canonical icon-button compatibility API for tab overflow menus.
 * The active-overflow dot adds meaning without changing the control geometry.
 */
export const OverflowMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  OverflowMenuTriggerProps
>(
  (
    {
      hasActiveOverflow = false,
      variant,
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => (
    <IconButton
      {...props}
      ref={ref}
      type='button'
      aria-label={
        ariaLabel ??
        (hasActiveOverflow ? 'More tabs, current tab hidden' : 'More tabs')
      }
      data-active-overflow={hasActiveOverflow ? 'true' : undefined}
      data-overflow-context={variant ?? 'drawer'}
      variant={variant === 'segment' ? 'overflowSegment' : 'overflowDrawer'}
      size='sm'
      className={cn('relative shrink-0', className)}
    >
      <MoreHorizontal
        className='size-3.5'
        aria-hidden='true'
        data-slot='overflow-glyph'
      />
      {hasActiveOverflow ? (
        <span
          className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent'
          aria-hidden='true'
        />
      ) : null}
    </IconButton>
  )
);
OverflowMenuTrigger.displayName = 'OverflowMenuTrigger';
