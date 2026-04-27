'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRecentReleasesQuery } from '@/lib/queries/useRecentReleasesQuery';
import { cn } from '@/lib/utils';
import { useDashboardData } from '../dashboard/DashboardDataContext';

interface DayCell {
  readonly date: Date;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly releases: ReleaseDot[];
}

interface ReleaseDot {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string;
  readonly status: 'draft' | 'scheduled' | 'released';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(
  cursor: Date,
  releasesByDay: Map<string, ReleaseDot[]>
): DayCell[] {
  const monthStart = startOfMonth(cursor);
  const today = startOfDay(new Date());

  // Grid starts on the Sunday on or before the 1st of the month.
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  // 6 weeks × 7 days = 42 cells (covers any month layout).
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    cells.push({
      date,
      inMonth: date.getMonth() === cursor.getMonth(),
      isToday: isSameDay(date, today),
      releases: releasesByDay.get(key) ?? [],
    });
  }
  return cells;
}

function statusTone(status: ReleaseDot['status']): string {
  switch (status) {
    case 'released':
      return 'bg-emerald-400';
    case 'scheduled':
      return 'bg-cyan-400';
    case 'draft':
    default:
      return 'bg-quaternary-token/60';
  }
}

function deriveStatus(releaseDate: string | null): ReleaseDot['status'] {
  if (!releaseDate) return 'draft';
  const ts = Date.parse(releaseDate);
  if (!Number.isFinite(ts)) return 'draft';
  return ts > Date.now() ? 'scheduled' : 'released';
}

export function CalendarPageClient() {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const { selectedProfile } = useDashboardData();
  const { data: releases, isLoading } = useRecentReleasesQuery(
    selectedProfile?.id
  );

  const releasesByDay = useMemo<Map<string, ReleaseDot[]>>(() => {
    const map = new Map<string, ReleaseDot[]>();
    if (!releases) return map;
    for (const r of releases) {
      const key = r.releaseDate?.slice(0, 10);
      if (!key) continue;
      const dot: ReleaseDot = {
        id: r.id,
        title: r.title,
        artworkUrl: r.artworkUrl ?? undefined,
        status: deriveStatus(r.releaseDate),
      };
      const list = map.get(key);
      if (list) list.push(dot);
      else map.set(key, [dot]);
    }
    return map;
  }, [releases]);

  const grid = useMemo(
    () => buildMonthGrid(cursor, releasesByDay),
    [cursor, releasesByDay]
  );

  const selectedReleases = useMemo<ReleaseDot[]>(() => {
    if (!selectedDay) return [];
    const key = selectedDay.toISOString().slice(0, 10);
    return releasesByDay.get(key) ?? [];
  }, [selectedDay, releasesByDay]);

  return (
    <div className='flex h-full flex-col gap-6 p-6'>
      <header className='flex flex-col gap-1'>
        <h1
          className='text-[24px] font-semibold leading-tight text-primary-token'
          style={{ letterSpacing: '-0.018em' }}
        >
          Calendar
        </h1>
        <p className='text-[12.5px] text-tertiary-token'>
          Releases + release moments — month at a glance.
        </p>
      </header>

      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={() => {
            const next = new Date(cursor);
            next.setMonth(cursor.getMonth() - 1);
            setCursor(startOfMonth(next));
          }}
          className='h-7 w-7 grid place-items-center rounded-md text-tertiary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
          aria-label='Previous month'
        >
          <ChevronLeft className='h-4 w-4' strokeWidth={2.25} />
        </button>
        <h2 className='text-[15px] font-medium text-primary-token tabular-nums'>
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </h2>
        <button
          type='button'
          onClick={() => {
            const next = new Date(cursor);
            next.setMonth(cursor.getMonth() + 1);
            setCursor(startOfMonth(next));
          }}
          className='h-7 w-7 grid place-items-center rounded-md text-tertiary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
          aria-label='Next month'
        >
          <ChevronRight className='h-4 w-4' strokeWidth={2.25} />
        </button>
        <button
          type='button'
          onClick={() => setCursor(startOfMonth(new Date()))}
          className='ml-2 h-7 px-3 rounded-md text-[12px] font-caption text-tertiary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
        >
          Today
        </button>
      </div>

      <div className='rounded-xl border border-(--linear-app-shell-border) overflow-hidden bg-(--linear-app-content-surface)'>
        <div className='grid grid-cols-7 border-b border-(--linear-app-shell-border)/60'>
          {DAY_NAMES.map(d => (
            <div
              key={d}
              className='px-2 py-2 text-[10.5px] font-caption uppercase tracking-[0.06em] text-quaternary-token text-center'
            >
              {d}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7'>
          {grid.map(cell => {
            const key = cell.date.toISOString().slice(0, 10);
            const hasReleases = cell.releases.length > 0;
            const isSelected = selectedDay && isSameDay(cell.date, selectedDay);
            return (
              <button
                key={key}
                type='button'
                onClick={() => setSelectedDay(cell.date)}
                className={cn(
                  'relative flex flex-col items-start gap-1 min-h-[88px] px-2 pt-2 pb-1.5 border-b border-r border-(--linear-app-shell-border)/40 text-left transition-colors duration-150 ease-out',
                  cell.inMonth
                    ? 'hover:bg-surface-1/40'
                    : 'text-quaternary-token/70',
                  isSelected && 'bg-cyan-300/[0.06]',
                  cell.isToday &&
                    'before:absolute before:left-1.5 before:top-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-cyan-300'
                )}
              >
                <span
                  className={cn(
                    'text-[12px] font-caption tabular-nums',
                    cell.isToday && 'pl-3 text-primary-token font-medium',
                    !cell.isToday && cell.inMonth && 'text-secondary-token'
                  )}
                >
                  {cell.date.getDate()}
                </span>
                {hasReleases && (
                  <div className='flex flex-col gap-1 w-full'>
                    {cell.releases.slice(0, 3).map(r => (
                      <div
                        key={r.id}
                        className='flex items-center gap-1.5 min-w-0'
                        title={`${r.title} (${r.status})`}
                      >
                        <span
                          aria-hidden='true'
                          className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            statusTone(r.status)
                          )}
                        />
                        <span className='text-[10.5px] text-secondary-token truncate'>
                          {r.title}
                        </span>
                      </div>
                    ))}
                    {cell.releases.length > 3 && (
                      <span className='text-[10px] text-quaternary-token'>
                        +{cell.releases.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <section className='rounded-xl border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) p-4'>
          <h3 className='text-[13px] font-medium text-primary-token'>
            {selectedDay.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          {selectedReleases.length === 0 ? (
            <p className='mt-2 text-[12px] text-tertiary-token'>
              No releases on this day.
            </p>
          ) : (
            <ul className='mt-3 flex flex-col gap-2'>
              {selectedReleases.map(r => (
                <li key={r.id} className='flex items-center gap-3'>
                  <div className='relative h-9 w-9 rounded overflow-hidden bg-surface-2 shrink-0'>
                    {r.artworkUrl && (
                      <Image
                        src={r.artworkUrl}
                        alt=''
                        fill
                        sizes='36px'
                        className='object-cover'
                        unoptimized
                      />
                    )}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='text-[12.5px] font-caption text-primary-token truncate'>
                      {r.title}
                    </div>
                    <div className='text-[10.5px] text-tertiary-token capitalize'>
                      {r.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isLoading && (
        <div className='text-[12px] text-quaternary-token'>
          Loading releases…
        </div>
      )}
    </div>
  );
}
