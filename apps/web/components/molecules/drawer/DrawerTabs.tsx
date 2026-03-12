'use client';

import type { SegmentControlOption } from '@jovie/ui';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { cn } from '@/lib/utils';

export interface DrawerTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel?: string;
  readonly 'aria-label'?: string;
  readonly className?: string;
  readonly triggerClassName?: string;
}

export function DrawerTabs<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  'aria-label': ariaLabelProp,
  className,
  triggerClassName,
}: DrawerTabsProps<T>) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onValueChange}
      options={options}
      aria-label={ariaLabel ?? ariaLabelProp}
      className={cn('w-full', className)}
      triggerClassName={cn('h-[34px] px-3.5 text-[12.5px]', triggerClassName)}
    />
  );
}
