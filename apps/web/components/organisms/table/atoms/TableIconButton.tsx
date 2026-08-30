'use client';

import { IconButton, SimpleTooltip } from '@jovie/ui';
import type { ReactNode } from 'react';

export interface TableIconButtonProps {
  readonly icon: ReactNode;
  readonly onClick: () => void;
  readonly ariaLabel: string;
  readonly tooltip?: string;
  readonly variant?: 'ghost' | 'danger';
  readonly className?: string;
}

/**
 * Compact table row icon control. Geometry, focus, and the 44px hit target
 * belong to the shared IconButton contract: 40px visible (`lg`) inside the
 * base Button pseudo-element target. Quiet secondary chrome keeps overflow
 * visible so the hit target is not clipped.
 */
export function TableIconButton({
  icon,
  onClick,
  ariaLabel,
  tooltip,
  variant = 'ghost',
  className,
}: TableIconButtonProps) {
  const button = (
    <IconButton
      variant='secondary'
      size='lg'
      destructive={variant === 'danger'}
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={className}
    >
      {icon}
    </IconButton>
  );

  if (tooltip) {
    return <SimpleTooltip content={tooltip}>{button}</SimpleTooltip>;
  }

  return button;
}
