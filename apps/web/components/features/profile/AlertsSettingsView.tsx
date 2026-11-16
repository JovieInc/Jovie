'use client';

import { PlainButton, Switch } from '@jovie/ui';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { NotificationContentType } from '@/types/notifications';

const NATIVE_PANEL_CLASS_NAME = '-mx-4 space-y-0 pb-2';

type ToggleProps = Readonly<{
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
}>;

function SettingsToggle({
  id,
  checked,
  disabled,
  onCheckedChange,
  ariaLabel,
  ariaDescribedBy,
}: ToggleProps) {
  return (
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    />
  );
}

type RowProps = Readonly<{
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}>;

function AlertsSettingsRow({
  label,
  description,
  checked,
  disabled,
  onClick,
}: RowProps) {
  const switchId = useId();
  const descriptionId = `${switchId}-description`;

  return (
    <label
      htmlFor={switchId}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex min-h-15 w-full items-center gap-3 border-t border-on-media/[0.075] px-4 py-3 text-left transition-colors duration-subtle first:border-t-0 hover:bg-on-media/[0.03]',
        disabled && 'cursor-default hover:bg-transparent'
      )}
    >
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium tracking-tight text-on-media'>
          {label}
        </p>
        <p
          id={descriptionId}
          className='truncate text-2xs leading-4 text-on-media/50'
        >
          {description}
        </p>
      </div>
      <SettingsToggle
        id={switchId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onClick}
        ariaLabel={label}
        ariaDescribedBy={descriptionId}
      />
    </label>
  );
}

const PREFERENCE_ROWS = [
  ['New Music', 'Singles, albums, and videos.', 'newMusic'],
  ['Events', 'Upcoming events and tickets.', 'tourDates'],
  ['Merch', 'Drops, restocks, and low-stock updates.', 'merch'],
  ['General', 'Occasional artist updates.', 'general'],
] as const;

type ViewProps = Readonly<{
  isSubscribed: boolean;
  contentPrefs: Record<NotificationContentType, boolean>;
  onTogglePref: (key: NotificationContentType) => void;
  onUnsubscribe: () => void;
  isUnsubscribing: boolean;
  presentation?: 'panel' | 'embedded';
}>;

export function AlertsSettingsView({
  isSubscribed,
  contentPrefs,
  onTogglePref,
  onUnsubscribe,
  isUnsubscribing,
  presentation = 'panel',
}: ViewProps) {
  const disabled = !isSubscribed;

  return (
    <div
      className={presentation === 'panel' ? NATIVE_PANEL_CLASS_NAME : undefined}
      data-testid='profile-alerts-settings'
    >
      {presentation === 'panel' ? (
        <div className='flex items-baseline justify-between px-4 pb-2 pt-3'>
          <h2 className='text-balance text-xl font-semibold leading-none tracking-tight text-on-media'>
            Alerts
          </h2>
          <span className='text-app font-medium text-on-media/52'>
            {isSubscribed ? 'On' : 'Off'}
          </span>
        </div>
      ) : null}

      <div className='border-y border-on-media/[0.075]'>
        {PREFERENCE_ROWS.map(([label, description, key]) => (
          <AlertsSettingsRow
            key={key}
            label={label}
            description={description}
            checked={contentPrefs[key]}
            disabled={disabled}
            onClick={() => onTogglePref(key)}
          />
        ))}
      </div>

      {isSubscribed ? (
        <PlainButton
          type='button'
          onClick={onUnsubscribe}
          disabled={isUnsubscribing}
          className='mt-5 w-full px-4 py-3 text-center text-sm font-semibold text-on-media/72 transition-colors duration-subtle hover:text-on-media disabled:cursor-not-allowed disabled:text-on-media/36'
        >
          {isUnsubscribing ? 'Turning off...' : 'Turn off alerts'}
        </PlainButton>
      ) : (
        <p className='px-4 pt-4 text-xs leading-5 text-on-media/50'>
          Alert preferences appear here after alerts are enabled.
        </p>
      )}
    </div>
  );
}
