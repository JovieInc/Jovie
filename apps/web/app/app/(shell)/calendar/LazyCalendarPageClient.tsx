'use client';

import dynamic from 'next/dynamic';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';

const CALENDAR_WEEKDAY_KEYS = [
  'weekday-sun',
  'weekday-mon',
  'weekday-tue',
  'weekday-wed',
  'weekday-thu',
  'weekday-fri',
  'weekday-sat',
] as const;

const CALENDAR_GRID_CELL_KEYS = [
  'calendar-cell-01',
  'calendar-cell-02',
  'calendar-cell-03',
  'calendar-cell-04',
  'calendar-cell-05',
  'calendar-cell-06',
  'calendar-cell-07',
  'calendar-cell-08',
  'calendar-cell-09',
  'calendar-cell-10',
  'calendar-cell-11',
  'calendar-cell-12',
  'calendar-cell-13',
  'calendar-cell-14',
  'calendar-cell-15',
  'calendar-cell-16',
  'calendar-cell-17',
  'calendar-cell-18',
  'calendar-cell-19',
  'calendar-cell-20',
  'calendar-cell-21',
  'calendar-cell-22',
  'calendar-cell-23',
  'calendar-cell-24',
  'calendar-cell-25',
  'calendar-cell-26',
  'calendar-cell-27',
  'calendar-cell-28',
  'calendar-cell-29',
  'calendar-cell-30',
  'calendar-cell-31',
  'calendar-cell-32',
  'calendar-cell-33',
  'calendar-cell-34',
  'calendar-cell-35',
] as const;

export function CalendarRouteSkeleton() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Calendar'
      aria-live='polite'
      toolbar={
        <PageToolbar
          start={<div className='skeleton h-4 w-56 rounded-md' />}
          end={
            <div className='flex flex-wrap items-center justify-end gap-1'>
              <div className='skeleton h-7 w-12 rounded-full' />
              <div className='skeleton h-7 w-20 rounded-full' />
              <div className='skeleton h-7 w-16 rounded-full' />
              <div className='skeleton h-7 w-28 rounded-full' />
            </div>
          }
        />
      }
    >
      <PageContent>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='skeleton h-7 w-40 rounded-md' />
            <div className='skeleton h-7 w-16 rounded-md' />
          </div>
          <div className='overflow-hidden rounded-xl border border-subtle'>
            <div className='grid grid-cols-7 border-b border-subtle'>
              {CALENDAR_WEEKDAY_KEYS.map(key => (
                <div key={key} className='px-2 py-2'>
                  <div className='skeleton mx-auto h-3 w-8 rounded-sm' />
                </div>
              ))}
            </div>
            <div className='grid grid-cols-7'>
              {CALENDAR_GRID_CELL_KEYS.map(key => (
                <div
                  key={key}
                  className='min-h-24 border-b border-r border-subtle p-2 last:border-r-0'
                >
                  <div className='skeleton mb-2 h-3 w-5 rounded-sm' />
                  <div className='skeleton h-4 w-full rounded-sm' />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}

const CalendarPageClient = dynamic(
  () =>
    import('./CalendarPageClient').then(mod => ({
      default: mod.CalendarPageClient,
    })),
  {
    loading: () => <CalendarRouteSkeleton />,
  }
);

export function LazyCalendarPageClient() {
  return <CalendarPageClient />;
}
