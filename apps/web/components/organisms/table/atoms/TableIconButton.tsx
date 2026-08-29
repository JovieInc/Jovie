'use client';

import { IconButton, SimpleTooltip } from '@jovie/ui';
import { cn } from '@/lib/utils';

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
      variant='secondary'
      size='lg'
      destructive={variant === 'danger'}
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={cn(
        variant === 'danger' &&
          'text-error hover:bg-error-subtle hover:text-error focus-visible:bg-error-subtle focus-visible:text-error active:bg-error-subtle active:text-error',
        className
      )}
    >
      {icon}
    </IconButton>
  );

  if (tooltip) {
    return <SimpleTooltip content={tooltip}>{button}</SimpleTooltip>;
  }

  return button;
}
