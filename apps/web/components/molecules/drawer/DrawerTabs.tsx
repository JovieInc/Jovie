'use client';

import type { SegmentControlOption } from '@jovie/ui';
import { cn } from '@/lib/utils';

export const DRAWER_TABS_RAIL_CLASSNAME =
  'inline-flex min-w-0 items-center gap-1 rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-1';

export const DRAWER_TABS_TRIGGER_CLASSNAME =
  'inline-flex min-h-7 items-center justify-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-[11.5px] font-[510] tracking-[-0.01em] text-tertiary-token transition-[background-color,color,border-color,box-shadow] duration-150 hover:bg-surface-0 hover:text-primary-token';

export const DRAWER_TABS_TRIGGER_ACTIVE_CLASSNAME =
  'border-(--linear-app-frame-seam) bg-surface-0 text-primary-token';

export interface DrawerTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly triggerClassName?: string;
}

export function DrawerTabs<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  triggerClassName,
}: DrawerTabsProps<T>) {
  return (
    <div
      role='tablist'
      aria-label={ariaLabel}
      className={cn(
        DRAWER_TABS_RAIL_CLASSNAME,
        'flex w-full flex-wrap',
        className
      )}
    >
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          role='tab'
          aria-selected={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            DRAWER_TABS_TRIGGER_CLASSNAME,
            value === option.value && DRAWER_TABS_TRIGGER_ACTIVE_CLASSNAME,
            triggerClassName
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
