'use client';

import type { SegmentControlOption } from '@jovie/ui';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
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
    <AppSegmentControl
      value={value}
      onValueChange={onValueChange}
      options={options}
      aria-label={ariaLabel}
      className={cn(
        'w-full rounded-[9px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_78%,var(--linear-bg-surface-0))] p-0.5',
        className
      )}
      triggerClassName={cn(
        'h-[26px] rounded-[7px] px-2 text-[10.5px] font-[510] tracking-[-0.008em]',
        triggerClassName
      )}
    />
  );
}
