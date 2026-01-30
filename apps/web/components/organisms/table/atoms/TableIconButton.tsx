'use client';

import { Button, SimpleTooltip } from '@jovie/ui';
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
    <Button
      variant={variant === 'danger' ? 'destructive' : 'ghost'}
      size='icon'
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn('h-8 w-8', className)}
    >
      {icon}
    </Button>
  );

  if (tooltip) {
    return <SimpleTooltip content={tooltip}>{button}</SimpleTooltip>;
  }

  return button;
}
