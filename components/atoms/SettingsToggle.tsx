'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SettingsToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export const SettingsToggle = React.memo(function SettingsToggle({
  enabled,
  onToggle,
  disabled = false,
  label,
  className,
}: SettingsToggleProps) {
  return (
    <button
      type='button'
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        enabled ? 'bg-accent' : 'bg-surface-3',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onClick={() => onToggle(!enabled)}
      disabled={disabled}
      role='switch'
      aria-checked={enabled}
      aria-label={label}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          enabled ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
});
