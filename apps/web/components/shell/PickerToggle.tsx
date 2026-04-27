'use client';

import { cn } from '@/lib/utils';

export interface PickerToggleProps {
  /** Whether the toggle currently reads "on". Drives both the dot and the label. */
  readonly on: boolean;
  readonly onClick: () => void;
  /** Label rendered when `on === true`. */
  readonly onLabel: string;
  /** Label rendered when `on === false`. */
  readonly offLabel: string;
  /** Optional kbd hint shown on the right (e.g. `'⌘J'`). */
  readonly shortcut?: string;
  readonly className?: string;
}

/**
 * PickerToggle — rounded full-width row used inside picker / dropdown
 * surfaces for a binary on/off setting (e.g. "Push-to-talk on" /
 * "Push-to-talk off"). The leading dot turns emerald when `on`; the
 * label flips between the two strings to make the current state read
 * at a glance. Optional `shortcut` slot for a trailing `<kbd>`.
 *
 * @example
 * ```tsx
 * <PickerToggle
 *   on={pushToTalkOn}
 *   onClick={togglePushToTalk}
 *   onLabel='Push-to-talk on'
 *   offLabel='Push-to-talk off'
 *   shortcut='⌘J'
 * />
 * ```
 */
export function PickerToggle({
  on,
  onClick,
  onLabel,
  offLabel,
  shortcut,
  className,
}: PickerToggleProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'w-full flex items-center gap-2 rounded-md px-2 py-1 text-[11.5px] text-secondary-token hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
        className
      )}
    >
      <span
        aria-hidden='true'
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          on ? 'bg-emerald-400' : 'bg-tertiary-token/60'
        )}
      />
      <span className='flex-1 text-left'>{on ? onLabel : offLabel}</span>
      {shortcut && (
        <kbd className='text-[10px] text-quaternary-token'>{shortcut}</kbd>
      )}
    </button>
  );
}
