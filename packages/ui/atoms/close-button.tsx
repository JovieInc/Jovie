'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Shared close button styles for modal components.
 * Provides consistent close button styling across Dialog, AlertDialog, and Sheet.
 */
export const closeButtonStyles = {
  base: 'absolute right-4 top-4 rounded-[var(--radius-sm)] text-secondary-token opacity-70 transition-colors duration-normal ease-interactive p-1',
  hover:
    'hover:bg-interactive-hover hover:text-primary-token hover:opacity-100',
  focus:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  disabled: 'disabled:pointer-events-none',
  offset: 'ring-offset-background',
} as const;

/**
 * Combined close button class string.
 */
export const closeButtonClassName = [
  closeButtonStyles.base,
  closeButtonStyles.hover,
  closeButtonStyles.focus,
  closeButtonStyles.disabled,
  closeButtonStyles.offset,
].join(' ');

interface CloseButtonIconProps
  extends Readonly<{
    /**
     * Size of the X icon.
     * @default 4
     */
    readonly size?: number;
    readonly className?: string;
  }> {}

/**
 * Close button icon component for modal components.
 * Includes proper accessibility with screen-reader-only text.
 */
export function CloseButtonIcon({
  size = 4,
  className,
}: CloseButtonIconProps): React.ReactElement {
  return (
    <>
      <X className={cn(`h-${size} w-${size}`, className)} aria-hidden='true' />
      <span className='sr-only'>Close</span>
    </>
  );
}
CloseButtonIcon.displayName = 'CloseButtonIcon';
