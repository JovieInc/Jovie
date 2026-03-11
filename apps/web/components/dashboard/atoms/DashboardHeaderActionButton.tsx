'use client';

import type { ReactNode } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
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
    <AppIconButton
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'border-(--linear-border-subtle) bg-(--linear-bg-surface-0)',
        pressed &&
          'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-primary)',
        className
      )}
    >
      {icon}
    </AppIconButton>
  );
}
