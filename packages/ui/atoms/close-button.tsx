'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Shared close button styles for modal components.
 * Provides consistent close button styling across Dialog, AlertDialog, and Sheet.
 */
export const closeButtonStyles = {
  base: 'absolute right-4 top-4 rounded-sm opacity-70 transition-opacity',
  hover: 'hover:opacity-100',
  focus:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  disabled: 'disabled:pointer-events-none',
  offset: 'ring-offset-surface-1',
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

interface CloseButtonIconProps {
  /**
   * Size of the X icon.
   * @default 4
   */
  size?: number;
  className?: string;
}

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
