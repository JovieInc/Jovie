'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DrawerSettingsToggle } from './DrawerSettingsToggle';

export interface DrawerAsyncToggleProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly checked: boolean;
  readonly onToggle: (value: boolean) => Promise<void>;
  readonly successMessage?: (enabled: boolean) => string;
  readonly className?: string;
}

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

  useEffect(() => {
    setChecked(externalChecked);
  }, [externalChecked]);

  const handleChange = useCallback(
    async (value: boolean) => {
      setChecked(value);
      setIsPending(true);
      try {
        await onToggle(value);
        if (successMessage) toast.success(successMessage(value));
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
