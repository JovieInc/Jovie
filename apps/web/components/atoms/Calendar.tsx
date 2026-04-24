'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { DayPicker } from 'react-day-picker';

export type CalendarProps = ComponentProps<typeof DayPicker>;

const LazyCalendar = dynamic(() => import('./CalendarInner'), {
  ssr: false,
  loading: () => <div className='h-64' aria-hidden />,
});

export function Calendar(props: CalendarProps) {
  return <LazyCalendar {...props} />;
}
