'use client';

import { Switch } from '@jovie/ui';
import * as React from 'react';
import { SettingsPlanGateLabel } from '@/features/dashboard/atoms/SettingsPlanGateLabel';
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
  readonly gated?: boolean;
  readonly gatePlanName?: string;
  /** Feature name for contextual upgrade nudge (e.g., "Remove branding") */
  readonly gateFeatureContext?: string;
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
  gated = false,
  gatePlanName = 'Pro',
  gateFeatureContext,
}: SettingsToggleRowProps) {
  const reactId = React.useId();
  const baseId = id ?? `settings-toggle-${reactId}`;
  const titleId = `${baseId}-title`;
  const descriptionId = description ? `${baseId}-description` : undefined;

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-1.5 sm:gap-x-6',
        className
      )}
    >
      <div className='min-w-0'>
        <h3
          id={titleId}
          className={cn(
            'text-[13px] font-[510]',
            gated ? 'text-tertiary-token' : 'text-primary-token'
          )}
        >
          {title}
        </h3>
        {description ? (
          <p
            id={descriptionId}
            className={cn(
              'mt-0.5 text-[13px] leading-normal',
              gated ? 'text-quaternary-token' : 'text-tertiary-token'
            )}
          >
            {description}
          </p>
        ) : null}
      </div>

      <div className='flex min-h-8 items-center justify-end'>
        {gated ? (
          <SettingsPlanGateLabel
            planName={gatePlanName}
            featureContext={gateFeatureContext}
          />
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          />
        )}
      </div>
    </div>
  );
}
