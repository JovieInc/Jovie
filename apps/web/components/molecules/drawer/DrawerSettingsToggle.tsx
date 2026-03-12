'use client';

import { Switch } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DrawerSettingsToggleProps {
  /** Text label shown on the left */
  readonly label: string;
  /** Current toggle state */
  readonly checked: boolean;
  /** Toggle change handler */
  readonly onCheckedChange: (checked: boolean) => void;
  /** Disables the toggle (e.g. while saving) */
  readonly disabled?: boolean;
  /** Accessible label for the switch */
  readonly ariaLabel: string;
  /** Visual density for compact footer usage */
  readonly density?: 'default' | 'compact';
  readonly className?: string;
}

/**
 * Shared inline settings toggle for right-drawer sidebars.
 *
 * Renders label on the left and toggle on the right, all on a single line.
 *
 * Used by: DrawerAsyncToggle and any future drawer toggles.
 */
export function DrawerSettingsToggle({
  label,
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
  density = 'default',
  className,
}: DrawerSettingsToggleProps) {
  const id = React.useId();

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-[8px] py-1 transition-[background-color,box-shadow] duration-150 hover:bg-[var(--linear-bg-surface-1)] focus-within:bg-[var(--linear-bg-surface-1)] focus-within:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]',
        density === 'compact' ? 'min-h-[32px]' : 'min-h-[44px] lg:min-h-0',
        density === 'compact' ? 'px-1.5' : 'px-2',
        className
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          'cursor-pointer select-none text-[var(--linear-text-secondary)]',
          density === 'compact' ? 'text-[12px]' : 'text-[13px]'
        )}
      >
        {label}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
