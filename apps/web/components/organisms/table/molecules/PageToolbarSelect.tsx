'use client';

import { Button } from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { cn } from '@/lib/utils';
import {
  PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_ICON_STROKE_WIDTH,
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
} from './PageToolbar';

export interface PageToolbarSelectOption<T extends string> {
  readonly value: T;
  /** Shown on the trigger and, unless menuLabel is set, in the menu. */
  readonly label: string;
  /** Menu-only label, used to add a count: "Identified (312)". */
  readonly menuLabel?: string;
  readonly disabled?: boolean;
}

export interface PageToolbarSelectProps<T extends string> {
  /** Group name. Menu heading and the sr-only prefix of the trigger. */
  readonly label: string;
  readonly value: T;
  readonly options: readonly PageToolbarSelectOption<T>[];
  readonly onValueChange: (value: T) => void;
  /** The unfiltered value. The trigger reads as active when value differs. Omit when no value is "all". */
  readonly defaultValue?: T;
  readonly 'data-testid'?: string;
}

/**
 * Quiet single-choice filter for a page toolbar. A page keeps one tab row;
 * a choice that only narrows that page's data uses this select.
 */
export function PageToolbarSelect<T extends string>({
  label,
  value,
  options,
  onValueChange,
  defaultValue,
  'data-testid': testId,
}: PageToolbarSelectProps<T>) {
  const activeOption = options.find(option => option.value === value);
  const triggerLabel = activeOption?.label ?? value;
  const isActive = defaultValue !== undefined && value !== defaultValue;

  return (
    <ShellDropdown
      align='end'
      trigger={
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-testid={testId}
          className={cn(
            PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
            isActive && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS
          )}
        >
          <span className='sr-only'>{`${label}: ${triggerLabel}`}</span>
          <span className='min-w-0 truncate' aria-hidden='true'>
            {triggerLabel}
          </span>
          <ChevronDown
            aria-hidden='true'
            className={cn(PAGE_TOOLBAR_ICON_CLASS, 'shrink-0')}
            strokeWidth={PAGE_TOOLBAR_ICON_STROKE_WIDTH}
          />
        </Button>
      }
    >
      <ShellDropdown.Label>{label}</ShellDropdown.Label>
      <ShellDropdown.RadioGroup
        value={value}
        onValueChange={next => {
          onValueChange(next as T);
        }}
      >
        {options.map(option => (
          <ShellDropdown.RadioItem
            key={option.value}
            value={option.value}
            label={option.menuLabel ?? option.label}
            disabled={option.disabled}
          />
        ))}
      </ShellDropdown.RadioGroup>
    </ShellDropdown>
  );
}
