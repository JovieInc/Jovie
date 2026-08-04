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
  'calendar-cell-36',
  'calendar-cell-37',
  'calendar-cell-38',
  'calendar-cell-39',
  'calendar-cell-40',
  'calendar-cell-41',
  'calendar-cell-42',
] as const;

export function CalendarRouteSkeleton() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Calendar'
      aria-live='polite'
      contentPadding='none'
      toolbar={
        <PageToolbar
          start={<div className='skeleton h-7 w-56 rounded-full' />}
          end={<div className='skeleton h-7 w-12 rounded-full' />}
        />
      }
    >
      <PageContent className='px-3 py-2 sm:px-3 sm:py-2'>
        <div className='system-b-calendar-workspace-grid h-full min-h-0 gap-3'>
          <div
            aria-hidden='true'
            data-testid='calendar-filter-rail-skeleton'
            className='flex min-h-8 min-w-0 gap-1 overflow-hidden pb-0.5 lg:flex-col lg:overflow-visible lg:pb-0'
          >
            {['all', 'releases', 'events', 'review'].map(key => (
              <div
                key={key}
                className='skeleton h-7 w-20 shrink-0 rounded-full lg:w-full'
              />
            ))}
          </div>
          <div
            data-testid='calendar-grid-skeleton'
            className='system-b-calendar-main-plane overflow-hidden rounded-xl border border-subtle'
          >
            <div className='system-b-calendar-month-grid border-b border-subtle'>
              {CALENDAR_WEEKDAY_KEYS.map(key => (
                <div key={key} className='px-2 py-2'>
                  <div className='skeleton mx-auto h-3 w-8 rounded-sm' />
                </div>
              ))}
            </div>
            <div className='system-b-calendar-month-grid'>
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
