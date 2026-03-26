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
      className={cn(
        'flex items-center gap-1 rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-0.5',
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
            'min-h-7 rounded-[8px] border border-transparent bg-transparent px-3 py-1 text-[11px] font-[510] tracking-[-0.01em] text-secondary-token transition-[background-color,border-color,color] duration-150 hover:bg-surface-1 hover:text-primary-token',
            value === option.value &&
              'border-(--linear-app-frame-seam) bg-surface-0 text-primary-token',
            triggerClassName
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
