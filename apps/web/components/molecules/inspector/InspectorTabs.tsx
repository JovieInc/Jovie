'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import { SegmentControl, type SegmentControlOption } from '@jovie/ui';
import type { ReactNode } from 'react';

export interface InspectorTabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SegmentControlOption<T>[];
  readonly ariaLabel: string;
  readonly panelId?: string;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Canonical pill selector for inspector destinations, with shared keyboard behavior. */
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
    <div className='flex w-full items-start gap-2'>
      <div className='min-w-0 flex-1' data-testid='inspector-tabs'>
        <SegmentControl
          value={value}
          onValueChange={onValueChange}
          options={options.map(option => ({
            ...option,
            id:
              option.id ?? (panelId ? `${panelId}-${option.value}` : undefined),
            ariaControls: panelId ?? option.ariaControls,
            label: (
              <span data-testid={`drawer-tab-${option.value}`}>
                {option.label}
              </span>
            ),
          }))}
          aria-label={ariaLabel}
          size='sm'
          layout='fill'
          className={className}
          renderHiddenPanels={!panelId}
        />
      </div>
      {actions ? (
        <div className='ml-auto flex shrink-0 items-center self-start'>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
