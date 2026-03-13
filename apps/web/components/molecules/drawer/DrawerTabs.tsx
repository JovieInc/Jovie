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
      className={cn('w-full', className)}
      triggerClassName={triggerClassName}
    />
  );
}
