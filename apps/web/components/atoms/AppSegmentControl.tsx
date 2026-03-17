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
        surface === 'ghost' && 'border-subtle bg-transparent shadow-none',
        className
      )}
      triggerClassName={cn('data-[state=active]:shadow-none', triggerClassName)}
      {...props}
    />
  );
}
