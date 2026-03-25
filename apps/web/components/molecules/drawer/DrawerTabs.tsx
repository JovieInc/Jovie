'use client';

import type { SegmentControlOption } from '@jovie/ui';
import { cn } from '@/lib/utils';

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
      className={cn('flex items-center gap-1', className)}
    >
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          role='tab'
          aria-selected={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            'rounded-full border border-(--linear-app-frame-seam) bg-transparent px-3 py-1 text-[11px] font-[510] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token',
            value === option.value &&
              'bg-surface-0 text-primary-token shadow-sm',
            triggerClassName
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
