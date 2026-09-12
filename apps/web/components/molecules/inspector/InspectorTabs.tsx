'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';
import { TabBar } from '@/components/molecules/tab-bar/TabBar';

export interface InspectorTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly panelId?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/**
 * Global Inspector tab primitive.
 *
 * Selected = quiet fill + ion underline. Unselected stays tertiary.
 * Keyboard: Arrow / Home / End with roving tabindex. Not pill or toggle chrome.
 */
export function InspectorTabs<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  panelId,
  actions,
  className,
}: InspectorTabsProps<T>) {
  return (
    <TabBar
      value={value}
      onValueChange={onValueChange}
      options={options}
      ariaLabel={ariaLabel}
      panelId={panelId}
      actions={actions}
      className={className}
      variant='underline'
      distribution='fill'
      overflowMode='collapse'
    />
  );
}
