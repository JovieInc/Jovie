'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DashboardHeaderActionButtonProps {
  ariaLabel: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon: ReactNode;
  className?: string;
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
        'h-8 w-8 rounded-md border border-transparent bg-transparent text-primary-token/80 dark:text-secondary-token transition-colors hover:border-subtle hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive [&>svg]:h-4 [&>svg]:w-4',
        pressed &&
          'border-subtle bg-surface-2 text-primary-token dark:text-primary-token',
        className
      )}
    >
      {icon}
    </Button>
  );
}
