'use client';

// @coverage-via apps/web/components/molecules/inspector/InspectorRail.test.tsx
import type { SegmentControlOption } from '@jovie/ui';
import type { KeyboardEvent, ReactNode } from 'react';
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

const INSPECTOR_TAB_TRIGGER_CLASSNAME =
  'inline-flex min-h-7 min-w-18 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-none border-0 border-b-2 border-transparent bg-transparent px-2 py-1 text-2xs font-caption tracking-tight text-tertiary-token shadow-none transition-[background-color,border-color,color] duration-subtle hover:bg-surface-0/70 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35';

const INSPECTOR_TAB_TRIGGER_ACTIVE_CLASSNAME =
  'border-accent bg-surface-0/80 font-medium text-primary-token';

/**
 * Inspector tab primitive.
 *
 * Selected = quiet fill + ion underline. Unselected stays tertiary.
 * Keyboard: Arrow / Home / End with roving tabindex. Not pill or toggle chrome.
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
        className={cn(
          'flex min-w-0 w-full items-center gap-1 rounded-none border-0 bg-transparent p-0',
          className
        )}
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
              INSPECTOR_TAB_TRIGGER_CLASSNAME,
              value === option.value && INSPECTOR_TAB_TRIGGER_ACTIVE_CLASSNAME,
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
