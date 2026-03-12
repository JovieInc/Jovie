'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import {
  APP_CONTROL_BUTTON_CLASS,
  AppIconButton,
} from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

export interface DashboardHeaderActionButtonProps {
  readonly ariaLabel: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly icon: ReactNode;
  readonly label?: ReactNode;
  readonly hideLabelOnMobile?: boolean;
  readonly className?: string;
}

export function DashboardHeaderActionButton({
  ariaLabel,
  pressed,
  disabled,
  onClick,
  icon,
  label,
  hideLabelOnMobile = false,
  className,
}: DashboardHeaderActionButtonProps) {
  if (label) {
    return (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        disabled={disabled}
        className={cn(
          APP_CONTROL_BUTTON_CLASS,
          'px-3 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5',
          pressed &&
            'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-primary)',
          className
        )}
      >
        {icon}
        <span className={cn(hideLabelOnMobile && 'hidden sm:inline')}>
          {label}
        </span>
      </Button>
    );
  }

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
