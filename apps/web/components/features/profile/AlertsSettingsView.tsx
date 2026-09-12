'use client';

import { cn } from '@/lib/utils';
import type { NotificationContentType } from '@/types/notifications';

const NATIVE_PANEL_CLASS_NAME = '-mx-4 space-y-0 pb-2';

type ToggleProps = Readonly<{
  checked: boolean;
  disabled?: boolean;
}>;

function SettingsToggle({ checked, disabled }: ToggleProps) {
  return (
    <span
      className={cn(
        'relative h-7 w-11 shrink-0 rounded-full border p-0.5 transition-colors duration-subtle',
        checked
          ? 'border-white/40 bg-white dark:bg-surface-1'
          : 'border-white/14 bg-white/[0.08]',
        disabled && 'opacity-45'
      )}
      aria-hidden='true'
    >
      <span
        className={cn(
          'block h-6 w-6 rounded-full shadow-sm transition-transform duration-subtle',
          checked
            ? 'translate-x-4 bg-black dark:bg-black'
            : 'translate-x-0 bg-white dark:bg-surface-1'
        )}
      />
    </span>
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
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      role='switch'
      aria-label={label}
      aria-checked={checked}
      className='flex min-h-15 w-full items-center gap-3 border-t border-white/[0.075] px-4 py-3 text-left transition-colors duration-subtle first:border-t-0 hover:bg-white/[0.03] disabled:cursor-default disabled:hover:bg-transparent'
    >
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium tracking-tight text-white dark:text-white'>
          {label}
        </p>
        <p className='truncate text-2xs leading-4 text-white/50'>
          {description}
        </p>
      </div>
      <SettingsToggle checked={checked} disabled={disabled} />
    </button>
  );
}

const PREFERENCE_ROWS = [
  ['New Music', 'Singles, albums, and videos.', 'newMusic'],
  ['Events', 'Tour dates and ticket updates.', 'tourDates'],
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
          <h2 className='text-xl font-semibold leading-none tracking-tight text-white dark:text-white'>
            Alerts
          </h2>
          <span className='text-app font-medium text-white/52'>
            {isSubscribed ? 'On' : 'Off'}
          </span>
        </div>
      ) : null}

      <div className='border-y border-white/[0.075]'>
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
        <button
          type='button'
          onClick={onUnsubscribe}
          disabled={isUnsubscribing}
          className='mt-5 w-full px-4 py-3 text-center text-sm font-semibold text-white/72 transition-colors duration-subtle hover:text-white disabled:cursor-not-allowed disabled:text-white/36'
        >
          {isUnsubscribing ? 'Turning off...' : 'Turn off alerts'}
        </button>
      ) : (
        <p className='px-4 pt-4 text-xs leading-5 text-white/42'>
          Alert preferences appear here after alerts are enabled.
        </p>
      )}
    </div>
  );
}
