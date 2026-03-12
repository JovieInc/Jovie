'use client';

import {
  SegmentControl,
  type SegmentControlOption,
  type SegmentControlProps,
} from '@jovie/ui';
import { cn } from '@/lib/utils';

export interface AppSegmentControlProps<T extends string>
  extends Omit<
    SegmentControlProps<T>,
    'variant' | 'options' | 'value' | 'onValueChange'
  > {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly surface?: 'muted' | 'ghost';
}

export function AppSegmentControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'sm',
  surface = 'muted',
  className,
  triggerClassName,
  ...props
}: AppSegmentControlProps<T>) {
  return (
    <SegmentControl
      value={value}
      onValueChange={onValueChange}
      options={options}
      size={size}
      variant={surface === 'ghost' ? 'ghost' : 'default'}
      className={cn(
        surface === 'muted'
          ? 'rounded-[var(--linear-app-control-radius)] bg-(--linear-bg-surface-1) p-0.5'
          : 'rounded-[var(--linear-app-control-radius)] border-(--linear-border-subtle) bg-transparent p-0.5',
        className
      )}
      triggerClassName={cn(
        'rounded-[calc(var(--linear-app-control-radius)-1px)] px-2 py-0.5 text-[12px] font-[510] tracking-[-0.01em] data-[state=active]:bg-(--linear-bg-surface-0) data-[state=active]:shadow-none',
        triggerClassName
      )}
      {...props}
    />
  );
}
