'use client';

import { Switch } from '@jovie/ui';
import * as React from 'react';
import { SettingsPlanGateLabel } from '@/components/atoms/SettingsPlanGateLabel';
import { cn } from '@/lib/utils';

interface SettingsToggleRowBaseProps {
  readonly id?: string;
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly className?: string;
}

export interface InteractiveSettingsToggleRowProps
  extends SettingsToggleRowBaseProps {
  readonly gated?: false;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly ariaLabel: string;
}

export interface GatedSettingsToggleRowProps
  extends SettingsToggleRowBaseProps {
  readonly gated: true;
  readonly gatePlanName?: string;
  readonly gateFeatureContext?: string;
  readonly checked?: never;
  readonly onCheckedChange?: never;
  readonly disabled?: never;
  readonly ariaLabel?: never;
}

export type SettingsToggleRowProps =
  | InteractiveSettingsToggleRowProps
  | GatedSettingsToggleRowProps;

export function SettingsToggleRow(props: Readonly<SettingsToggleRowProps>) {
  const { id, icon, title, description, className } = props;
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
      <div className='flex min-w-0 items-start gap-3'>
        {icon ? (
          <div className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
            {icon}
          </div>
        ) : null}

        <div className='min-w-0'>
          <h3
            id={titleId}
            className={cn(
              'text-app font-semibold tracking-[-0.02em]',
              props.gated ? 'text-tertiary-token' : 'text-primary-token'
            )}
          >
            {title}
          </h3>
          {description ? (
            <p
              id={descriptionId}
              className={cn(
                'mt-1 text-xs leading-[16px]',
                props.gated ? 'text-quaternary-token' : 'text-secondary-token'
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className='flex min-h-8 items-center justify-end'>
        {props.gated ? (
          <SettingsPlanGateLabel
            planName={props.gatePlanName ?? 'Pro'}
            featureContext={props.gateFeatureContext}
          />
        ) : (
          <Switch
            checked={props.checked}
            onCheckedChange={props.onCheckedChange}
            disabled={props.disabled ?? false}
            aria-label={props.ariaLabel}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          />
        )}
      </div>
    </div>
  );
}
