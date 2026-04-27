'use client';

import type { ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface ThreadCardIconBtnProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly onClick?: () => void;
}

/**
 * Compact 24x24 icon button used in thread media-card toolbars
 * (image, audio, video). Sized smaller than `IconBtn` (28x28) so the
 * card chrome stays visually quiet — the card content is the focus.
 */
export function ThreadCardIconBtn({
  children,
  label,
  onClick,
}: ThreadCardIconBtnProps) {
  return (
    <Tooltip label={label}>
      <button
        type='button'
        onClick={onClick}
        className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}
