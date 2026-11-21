'use client';

import { Button } from '@jovie/ui';
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
      <Button
        type='button'
        variant='ghost'
        size='icon-xs'
        onClick={onClick}
        className='rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60'
        aria-label={label}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
