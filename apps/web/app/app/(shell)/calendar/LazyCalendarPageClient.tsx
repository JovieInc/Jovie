'use client';

import dynamic from 'next/dynamic';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';

const CALENDAR_GRID_CELL_KEYS = Array.from(
  { length: 35 },
  (_, index) => `calendar-cell-${index + 1}`
);

function CalendarRouteSkeleton() {
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
              {Array.from({ length: 7 }, (_, index) => (
                <div key={`weekday-${index + 1}`} className='px-2 py-2'>
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
