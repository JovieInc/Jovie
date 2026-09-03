'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  type AnalyticsRange,
  getTimeRangeLabel,
  isRangeBeyondRetention,
} from '@/lib/analytics/time-range';
import { cn } from '@/lib/utils';

/**
 * The single time-range selector for every analytics surface.
 *
 * All variants read their labels and retention gating from the canonical
 * time-range module (`@/lib/analytics/time-range`), so every surface applies
 * identical window semantics — never define ad-hoc range options in a
 * component again.
 *
 * Variants:
 * - `segment` — compact segmented pill control (sidebar headers)
 * - `menu` — dropdown with menu labels + plan locks (drawer rails)
 * - `tabs` — accessible tablist controlling a `tabpanel` (analytics page)
 */
export type TimeRangeSelectorVariant = 'segment' | 'menu' | 'tabs';

const DEFAULT_RANGES: readonly AnalyticsRange[] = ['7d', '30d'];

export interface TimeRangeSelectorProps<T extends AnalyticsRange> {
  readonly value: T;
  readonly onValueChange: (range: T) => void;
  /** Ranges to offer, in display order. Defaults to 7d/30d. */
  readonly ranges?: readonly T[];
  readonly variant?: TimeRangeSelectorVariant;
  /** Plan retention limit — ranges needing more days are disabled. */
  readonly maxRetentionDays?: number;
  /** Ranges locked behind a plan upgrade (shows a lock in menu variant). */
  readonly lockedRanges?: readonly T[];
  /** Required for the `tabs` variant: base id for tab ids. */
  readonly tabsBaseId?: string;
  /** Required for the `tabs` variant: id of the controlled tabpanel. */
  readonly panelId?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly triggerClassName?: string;
}

export function TimeRangeSelector<T extends AnalyticsRange>({
  value,
  onValueChange,
  ranges = DEFAULT_RANGES as readonly T[],
  variant = 'segment',
  maxRetentionDays,
  lockedRanges,
  tabsBaseId,
  panelId,
  ariaLabel,
  className,
  triggerClassName,
}: TimeRangeSelectorProps<T>) {
  const isLocked = (range: T): boolean =>
    lockedRanges?.includes(range) ?? false;
  const isDisabled = (range: T): boolean =>
    isLocked(range) || isRangeBeyondRetention(range, maxRetentionDays);

  if (variant === 'menu') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type='button'
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full border border-transparent px-1.5 py-0 text-2xs font-normal text-tertiary-token transition-colors duration-subtle hover:bg-surface-0 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              className
            )}
            aria-label={ariaLabel ?? 'Analytics Time Range'}
          >
            <span>{getTimeRangeLabel(value, 'menu')}</span>
            <ChevronDown
              size={10}
              className='text-tertiary-token'
              aria-hidden='true'
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-36'>
          {ranges.map(range => {
            const isActive = range === value;
            const disabled = isDisabled(range);
            return (
              <DropdownMenuItem
                key={range}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onValueChange(range);
                }}
                className={cn(isActive && 'font-medium')}
              >
                <span className='flex w-full items-center gap-2'>
                  <span className='flex-1'>
                    {getTimeRangeLabel(range, 'menu')}
                  </span>
                  {disabled && (
                    <Lock
                      size={12}
                      className='text-tertiary-token'
                      aria-hidden='true'
                    />
                  )}
                  {isActive && !disabled && (
                    <Check
                      size={14}
                      className='ml-auto text-primary-token'
                      aria-hidden='true'
                    />
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'tabs') {
    return (
      <AppSegmentControl
        value={value}
        onValueChange={onValueChange}
        options={ranges.map(range => {
          const disabled = isDisabled(range);

          return {
            value: range,
            label: getTimeRangeLabel(range, 'short'),
            disabled,
            id: tabsBaseId ? `${tabsBaseId}-tab-${range}` : undefined,
            ariaControls: panelId,
            title: disabled
              ? 'Upgrade to Pro for extended analytics'
              : undefined,
          };
        })}
        size='sm'
        className={className}
        triggerClassName={triggerClassName}
        aria-label={ariaLabel ?? 'Select Analytics Range'}
        renderHiddenPanels={panelId ? false : undefined}
      />
    );
  }

  return (
    <AppSegmentControl
      value={value}
      onValueChange={onValueChange}
      options={ranges.map(range => ({
        value: range,
        label: getTimeRangeLabel(range, 'short'),
        disabled: isDisabled(range),
      }))}
      size='sm'
      className={className}
      triggerClassName={triggerClassName}
      aria-label={ariaLabel ?? 'Analytics Time Range'}
    />
  );
}
