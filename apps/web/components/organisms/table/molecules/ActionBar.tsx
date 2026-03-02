'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const ACTION_BAR_BUTTON_CLASS =
  'h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-interactive-hover hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1';

interface ActionBarProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function ActionBar({ children, className }: ActionBarProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>{children}</div>
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
