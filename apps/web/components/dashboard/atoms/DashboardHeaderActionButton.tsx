'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DashboardHeaderActionButtonProps {
  readonly ariaLabel: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly icon: ReactNode;
  readonly className?: string;
}

export function DashboardHeaderActionButton({
  ariaLabel,
  pressed,
  disabled,
  onClick,
  icon,
  className,
}: DashboardHeaderActionButtonProps) {
  return (
    <Button
      variant='ghost'
      size='icon'
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'h-8 w-8 rounded-md border border-transparent bg-transparent text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:bg-interactive-hover [&>svg]:h-4 [&>svg]:w-4',
        pressed && 'bg-surface-2 text-primary-token',
        className
      )}
    >
      {icon}
    </Button>
  );
}
