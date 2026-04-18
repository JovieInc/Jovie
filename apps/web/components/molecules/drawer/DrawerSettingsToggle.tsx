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
  readonly testId?: string;
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
  testId,
}: DrawerSettingsToggleProps) {
  const id = useId();

  return (
    <div
      data-testid={testId}
      className={cn(
        'flex items-center justify-between gap-3 rounded-[10px] border py-px transition-[background-color,border-color] duration-150',
        density === 'compact'
          ? 'border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))]'
          : 'border-(--linear-app-frame-seam) bg-surface-0',
        !disabled &&
          'hover:border-default hover:bg-surface-1 focus-within:border-default focus-within:bg-surface-1',
        density === 'compact' ? 'min-h-[28px]' : 'min-h-[36px] lg:min-h-0',
        density === 'compact' ? 'px-2' : 'px-2.5',
        disabled && 'opacity-60',
        className
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          'select-none text-secondary-token',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          density === 'compact' ? 'text-[11.5px] font-[500]' : 'text-[12px]'
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
