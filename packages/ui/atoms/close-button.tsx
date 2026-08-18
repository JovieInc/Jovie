'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Shared close button styles for modal components.
 * Provides consistent close button styling across Dialog, AlertDialog, and Sheet.
 */
export const closeButtonStyles = {
  base: 'absolute right-4 top-4 inline-flex size-12 items-center justify-center rounded-full text-secondary-token transition-colors duration-normal ease-interactive',
  hover: 'hover:bg-interactive-hover hover:text-primary-token',
  focus:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
  disabled:
    'disabled:pointer-events-none disabled:text-(--color-text-disabled-token) disabled:opacity-[var(--state-disabled-opacity)]',
  offset: 'ring-offset-(--linear-bg-page)',
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
     * Size of the X icon in four-pixel spacing units.
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
      <X
        size={size * 4}
        className={cn('shrink-0', className)}
        aria-hidden='true'
        data-slot='close-icon'
      />
      <span className='sr-only'>Close</span>
    </>
  );
}
CloseButtonIcon.displayName = 'CloseButtonIcon';
