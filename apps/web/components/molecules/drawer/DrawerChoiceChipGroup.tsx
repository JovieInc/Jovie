'use client';

import { cn } from '@/lib/utils';

export interface DrawerChoiceChipOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface DrawerChoiceChipGroupProps<T extends string> {
  readonly options: readonly DrawerChoiceChipOption<T>[];
  readonly selectedValues: readonly T[];
  readonly onToggle: (value: T) => void;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly testId?: string;
}

/** Compact, wrapping multi-choice control for a flat drawer surface. */
export function DrawerChoiceChipGroup<T extends string>({
  options,
  selectedValues,
  onToggle,
  ariaLabel,
  className,
  testId,
}: DrawerChoiceChipGroupProps<T>) {
  const selected = new Set(selectedValues);

  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        'm-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0',
        className
      )}
      data-choice-chip-group
      data-testid={testId}
    >
      {options.map(option => {
        const isSelected = selected.has(option.value);

        return (
          <button
            key={option.value}
            type='button'
            aria-pressed={isSelected}
            disabled={option.disabled}
            data-state={isSelected ? 'on' : 'off'}
            title={option.label}
            onClick={() => onToggle(option.value)}
            className={cn(
              'inline-flex min-h-11 max-w-full shrink-0 items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-2xs font-caption leading-none shadow-none transition-[background-color,border-color,color] duration-subtle',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35',
              'disabled:pointer-events-none disabled:opacity-45 sm:min-h-7',
              isSelected
                ? 'border-default bg-surface-1 font-medium text-primary-token'
                : 'border-transparent bg-surface-0 text-secondary-token hover:border-subtle hover:bg-surface-1 hover:text-primary-token'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
