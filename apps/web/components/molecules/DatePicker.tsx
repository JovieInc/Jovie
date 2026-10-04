'use client';

// @coverage-via apps/web/tests/components/molecules/DatePicker.test.tsx

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { format, isValid, parse, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/atoms/Calendar';
import { cn } from '@/lib/utils';

export const DATE_PICKER_ISO_FORMAT = 'yyyy-MM-dd';
export const DATE_PICKER_DISPLAY_FORMAT = 'MMM d, yyyy';
export const DATE_PICKER_PLACEHOLDER = 'Pick a date';

/**
 * Parse a stored date value for the calendar surface. Strict `yyyy-MM-dd`
 * values parse as plain calendar dates; anything else falls back to lenient
 * ISO parsing so legacy datetime strings still resolve to a day.
 */
export function parseDatePickerValue(
  value: string | null | undefined
): Date | undefined {
  if (!value) return undefined;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parse(value, DATE_PICKER_ISO_FORMAT, new Date(0))
    : parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

export function formatDatePickerValue(
  value: string | null | undefined
): string {
  const parsed = parseDatePickerValue(value);
  return parsed
    ? format(parsed, DATE_PICKER_DISPLAY_FORMAT)
    : DATE_PICKER_PLACEHOLDER;
}

export interface DatePickerProps {
  readonly id?: string;
  /** Stored value as `yyyy-MM-dd` (or a parseable ISO string); '' clears. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = DATE_PICKER_PLACEHOLDER,
  className,
}: DatePickerProps) {
  const selected = parseDatePickerValue(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type='button'
          disabled={disabled}
          className={cn(
            'relative flex h-8 w-full items-center justify-start gap-2 rounded-lg border border-subtle bg-surface-0 px-3 text-xs font-normal text-primary-token transition-colors duration-subtle before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:-translate-x-1/2 before:-translate-y-1/2 hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            !selected && 'text-tertiary-token',
            className
          )}
        >
          <CalendarIcon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
          <span>
            {selected
              ? format(selected, DATE_PICKER_DISPLAY_FORMAT)
              : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className='w-auto' align='start' size='bare'>
        <Calendar
          mode='single'
          selected={selected}
          onSelect={date => {
            if (!date) return;
            onChange(format(date, DATE_PICKER_ISO_FORMAT));
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
