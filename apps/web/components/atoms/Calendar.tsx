'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarChevron({ orientation }: { orientation?: string }) {
  return orientation === 'left' ? (
    <ChevronLeft className='h-4 w-4' />
  ) : (
    <ChevronRight className='h-4 w-4' />
  );
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        month_caption:
          'flex items-center justify-center h-8 text-app font-medium tracking-[-0.01em] text-primary-token',
        caption_label: 'text-app font-medium',
        nav: 'flex items-center gap-1 absolute right-3 top-3',
        button_previous: cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary-token',
          'hover:bg-interactive-hover hover:text-primary-token transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        ),
        button_next: cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-md text-secondary-token',
          'hover:bg-interactive-hover hover:text-primary-token transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'w-8 text-[11px] font-medium text-secondary-token text-center pb-1',
        week: 'flex w-full mt-0.5',
        day: 'h-8 w-8 p-0 text-center',
        day_button: cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-app font-normal text-primary-token',
          'hover:bg-interactive-hover transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        ),
        selected:
          '[&>button]:bg-accent [&>button]:text-accent-foreground [&>button]:hover:bg-accent [&>button]:font-medium',
        today: '[&>button]:text-accent [&>button]:font-medium',
        outside: '[&>button]:text-tertiary-token [&>button]:opacity-50',
        disabled: '[&>button]:opacity-40 [&>button]:pointer-events-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: CalendarChevron,
      }}
      {...props}
    />
  );
}
