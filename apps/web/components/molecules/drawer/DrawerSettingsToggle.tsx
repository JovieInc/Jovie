'use client';

import { Switch } from '@jovie/ui';
import { useId } from 'react';
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
  const id = useId();

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded py-px transition-[background-color] duration-150',
        !disabled && 'hover:bg-surface-1 focus-within:bg-surface-1',
        density === 'compact' ? 'min-h-[28px]' : 'min-h-[36px] lg:min-h-0',
        density === 'compact' ? 'px-1' : 'px-1.5',
        disabled && 'opacity-60',
        className
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          'select-none text-secondary-token',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          density === 'compact' ? 'text-[11px]' : 'text-[12px]'
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
