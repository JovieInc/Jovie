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
    <div
      className={cn(
        'flex items-center justify-between gap-4 sm:gap-8',
        className
      )}
    >
      <div className='flex-1 min-w-0'>
        <h3 id={titleId} className='text-[13px] font-medium text-primary-token'>
          {title}
        </h3>
        {description ? (
          <p
            id={descriptionId}
            className='mt-0.5 text-xs leading-normal text-tertiary-token'
          >
            {description}
          </p>
        ) : null}
      </div>

      <div className='shrink-0 pt-0.5'>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        />
      </div>
    </div>
  );
}
