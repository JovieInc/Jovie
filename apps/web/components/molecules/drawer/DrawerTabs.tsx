'use client';

import type { SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_TABS_RAIL_CLASSNAME =
  'flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden rounded-full border-0 bg-transparent p-0 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const DRAWER_TABS_TRIGGER_CLASSNAME =
  'inline-flex min-h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-(--linear-app-frame-seam) bg-transparent px-2.5 py-1 text-[11.5px] font-[510] tracking-[-0.01em] text-tertiary-token transition-[background-color,color,border-color] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token';

export const DRAWER_TABS_TRIGGER_ACTIVE_CLASSNAME =
  'border-(--linear-app-frame-seam) bg-surface-0 text-primary-token';

export interface DrawerTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly actionsClassName?: string;
  readonly triggerClassName?: string;
}

export function DrawerTabs<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  actions,
  className,
  actionsClassName,
  triggerClassName,
}: DrawerTabsProps<T>) {
  return (
    <div className='flex w-full items-start gap-2'>
      <div
        role='tablist'
        aria-label={ariaLabel}
        className={cn(DRAWER_TABS_RAIL_CLASSNAME, 'w-full flex-1', className)}
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
      {actions ? (
        <div
          className={cn(
            'ml-auto flex shrink-0 items-center self-start',
            actionsClassName
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
