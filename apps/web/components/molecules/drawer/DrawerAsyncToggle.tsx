'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DrawerSettingsToggle } from './DrawerSettingsToggle';

export interface DrawerAsyncToggleProps {
  /** Text label shown on the left */
  readonly label: string;
  /** Accessible label for the switch */
  readonly ariaLabel: string;
  /** Current persisted value (component syncs when this changes) */
  readonly checked: boolean;
  /** Async handler called when the user toggles — reverts on error */
  readonly onToggle: (checked: boolean) => Promise<void>;
  /** Optional success message (receives the new checked state) */
  readonly successMessage?: (checked: boolean) => string;
  readonly className?: string;
}

/**
 * Async-aware settings toggle for right-drawer sidebars.
 *
 * Wraps DrawerSettingsToggle with optimistic state, automatic
 * revert on error, pending-disabled state, and prop sync.
 *
 * Used by: Release sidebar (art downloads), Profile sidebar (photo downloads),
 * and any future async boolean settings.
 */
export function DrawerAsyncToggle({
  label,
  ariaLabel,
  checked: externalChecked,
  onToggle,
  successMessage,
  className,
}: DrawerAsyncToggleProps) {
  const [checked, setChecked] = useState(externalChecked);
  const [isPending, setIsPending] = useState(false);

  // Sync local state when the external prop changes
  useEffect(() => {
    setChecked(externalChecked);
  }, [externalChecked]);

  const handleChange = useCallback(
    async (value: boolean) => {
      setChecked(value);
      setIsPending(true);
      try {
        await onToggle(value);
        if (successMessage) {
          toast.success(successMessage(value));
        }
      } catch {
        setChecked(!value);
        toast.error('Failed to update setting');
      } finally {
        setIsPending(false);
      }
    },
    [onToggle, successMessage]
  );

  return (
    <DrawerSettingsToggle
      label={label}
      checked={checked}
      onCheckedChange={handleChange}
      disabled={isPending}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
