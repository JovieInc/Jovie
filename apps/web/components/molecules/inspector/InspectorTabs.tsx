'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { SegmentControlOption } from '@jovie/ui';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME,
  TAB_BAR_DRAWER_TRIGGER_CLASSNAME,
  TAB_BAR_RAIL_CLASSNAME,
} from '@/components/molecules/tab-bar/TabBar';
import { cn } from '@/lib/utils';
import { handleInspectorTabListKeyDown } from './inspector-tab-keyboard';

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
 * Inspector tab primitive.
 *
 * Canonical pill segmented control (shared TabBar classes) plus roving
 * tabindex. Keyboard: Arrow / Home / End.
 * Lives here so Contacts/Audience TabBar stays off the exact-head --changed set.
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
    <div className='flex w-full items-start gap-2'>
      <div
        role='tablist'
        aria-label={ariaLabel}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) =>
          handleInspectorTabListKeyDown(event, options, value, onValueChange)
        }
        className={cn(TAB_BAR_RAIL_CLASSNAME, 'w-full', className)}
        data-testid='inspector-tabs'
      >
        {options.map(option => (
          <button
            key={option.value}
            type='button'
            role='tab'
            data-testid={`drawer-tab-${option.value}`}
            aria-selected={value === option.value}
            aria-controls={panelId}
            tabIndex={value === option.value ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              TAB_BAR_DRAWER_TRIGGER_CLASSNAME,
              'min-w-18 flex-1',
              value === option.value && TAB_BAR_DRAWER_TRIGGER_ACTIVE_CLASSNAME,
              option.disabled && 'pointer-events-none opacity-45'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {actions ? (
        <div className='ml-auto flex shrink-0 items-center self-start'>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
