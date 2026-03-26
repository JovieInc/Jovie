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
      className={cn('flex items-center gap-0', className)}
    >
      {options.map(option => (
        <button
          key={option.value}
          type='button'
          role='tab'
          aria-selected={value === option.value}
          onClick={() => onValueChange(option.value)}
          className={cn(
            'relative px-3 py-1.5 text-[12px] font-[510] tracking-[-0.01em] text-tertiary-token transition-colors duration-150 hover:text-primary-token',
            value === option.value && 'text-primary-token',
            triggerClassName
          )}
        >
          {option.label}
          {value === option.value && (
            <span className='absolute inset-x-3 bottom-0 h-[1.5px] rounded-full bg-primary-token' />
          )}
        </button>
      ))}
    </div>
  );
}
