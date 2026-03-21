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
      surface='ghost'
      aria-label={ariaLabel}
      className={cn(
        'w-full rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className
      )}
      triggerClassName={cn(
        'h-[27px] rounded-full px-3 text-[11px] font-[510] tracking-[-0.008em] text-tertiary-token data-[state=active]:bg-surface-0 data-[state=active]:text-primary-token',
        triggerClassName
      )}
    />
  );
}
