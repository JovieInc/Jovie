'use client';

import { Switch } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SettingsToggleRowProps {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly ariaLabel: string;
}

export function SettingsToggleRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  ariaLabel,
}: SettingsToggleRowProps) {
  const reactId = React.useId();
  const baseId = id ?? `settings-toggle-${reactId}`;
  const titleId = `${baseId}-title`;
  const descriptionId = description ? `${baseId}-description` : undefined;

  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className='flex-1'>
        <h3 id={titleId} className='text-lg font-medium text-primary-token'>
          {title}
        </h3>
        {description ? (
          <p
            id={descriptionId}
            className='mt-2 text-sm text-secondary-token max-w-md'
          >
            {description}
          </p>
        ) : null}
      </div>

      <div className='shrink-0'>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(disabled && 'opacity-50 cursor-not-allowed')}
        />
      </div>
    </div>
  );
}
