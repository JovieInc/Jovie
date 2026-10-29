'use client';

import { IconButton } from '@jovie/ui';
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
      <IconButton
        variant='ghost'
        size='xs'
        type='button'
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}
