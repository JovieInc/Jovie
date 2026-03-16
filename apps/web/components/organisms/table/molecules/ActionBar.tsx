'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ReactNode } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

export const ACTION_BAR_BUTTON_CLASS = APP_CONTROL_BUTTON_CLASS;

interface ActionBarProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ActionBar({ children, className }: ActionBarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-(--linear-app-toolbar-gap)',
        className
      )}
    >
      {children}
    </div>
  );
}

interface ActionBarItemProps {
  readonly children: ReactNode;
  readonly tooltipLabel: string;
  readonly shortcut?: string;
}

export function ActionBarItem({
  children,
  tooltipLabel,
  shortcut,
}: ActionBarItemProps) {
  return (
    <TooltipShortcut label={tooltipLabel} shortcut={shortcut} side='bottom'>
      <div>{children}</div>
    </TooltipShortcut>
  );
}

interface ActionBarButtonProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly mobileIconOnly?: boolean;
}

export function ActionBarButton({
  label,
  icon,
  onClick,
  className,
  mobileIconOnly = false,
}: ActionBarButtonProps) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onClick}
      className={cn(ACTION_BAR_BUTTON_CLASS, className)}
      aria-label={label}
    >
      <span className='h-3.5 w-3.5'>{icon}</span>
      <span className={cn(mobileIconOnly && 'hidden sm:inline')}>{label}</span>
    </Button>
  );
}
