'use client';

import type { SegmentControlProps } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';

export interface RouteSegmentControlOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly href: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}

export interface RouteSegmentControlProps<T extends string>
  extends Pick<
    SegmentControlProps<T>,
    | 'aria-label'
    | 'className'
    | 'indicatorClassName'
    | 'layout'
    | 'listClassName'
    | 'size'
    | 'triggerClassName'
  > {
  readonly value: T;
  readonly options: readonly RouteSegmentControlOption<T>[];
  readonly surface?: 'muted' | 'ghost';
}

/**
 * Canonical route-aware segmented control.
 *
 * Route owners provide serializable values and hrefs; the existing
 * AppSegmentControl remains the sole owner of geometry, interaction states,
 * focus treatment, and 44px touch targets.
 */
export function RouteSegmentControl<T extends string>({
  value,
  options,
  ...props
}: RouteSegmentControlProps<T>) {
  const router = useRouter();

  const handleValueChange = useCallback(
    (nextValue: T) => {
      if (nextValue === value) return;

      const nextOption = options.find(option => option.value === nextValue);
      if (!nextOption || nextOption.disabled) return;

      router.push(nextOption.href);
    },
    [options, router, value]
  );

  return (
    <AppSegmentControl
      {...props}
      value={value}
      onValueChange={handleValueChange}
      options={options}
    />
  );
}
