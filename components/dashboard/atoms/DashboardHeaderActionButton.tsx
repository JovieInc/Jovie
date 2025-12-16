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
        'h-9 w-9 rounded-md border border-subtle bg-transparent text-primary-token/80 dark:text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive',
        pressed && 'bg-surface-2 text-primary-token dark:text-primary-token',
        className
      )}
    >
      {icon}
    </Button>
  );
}
