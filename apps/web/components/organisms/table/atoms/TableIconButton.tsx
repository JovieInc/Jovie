'use client';

import { IconButton, SimpleTooltip } from '@jovie/ui';

export interface TableIconButtonProps {
  readonly icon: React.ReactNode;
  readonly onClick: () => void;
  readonly ariaLabel: string;
  readonly tooltip?: string;
  readonly variant?: 'ghost' | 'danger';
  readonly className?: string;
}

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
      variant={variant === 'danger' ? 'destructive' : 'ghost'}
      size='lg'
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
