'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useMemo, useState, useTransition } from 'react';
import {
  confirmEvent,
  confirmEvents,
  rejectEvent,
  rejectEvents,
  undoRejectEvent,
} from '@/app/app/(shell)/dashboard/tour-dates/events-actions';
import { getEventLocalDateKey } from '@/lib/events/date';
import { queryKeys } from '@/lib/queries';
import { type EventRecord, useEventsQuery } from '@/lib/queries/useEventsQuery';
import { useRecentReleasesQuery } from '@/lib/queries/useRecentReleasesQuery';
import { cn } from '@/lib/utils';
import { useDashboardData } from '../dashboard/DashboardDataContext';

type FilterChip = 'all' | 'releases' | 'events' | 'needs_review';

interface ReleaseDot {
  readonly id: string;
  readonly title: string;
  readonly artworkUrl?: string;
  readonly status: 'draft' | 'scheduled' | 'released';
}

interface DayCell {
  readonly date: Date;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  readonly releases: ReleaseDot[];
  readonly events: EventRecord[];
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

const EVENT_TYPE_LABEL: Record<EventRecord['eventType'], string> = {
  tour: 'Tour',
  livestream: 'Livestream',
  listening_party: 'Listening party',
  ama: 'AMA',
  signing: 'Signing',
};

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

function localDateKey(d: Date): string {
  // YYYY-MM-DD in local time so day buckets line up with the grid cell
  // shown to the creator. Releases use this; events use the event-local
  // tz via getEventLocalDateKey for parity at the day-bucket level.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildMonthGrid(
  cursor: Date,
  releasesByDay: Map<string, ReleaseDot[]>,
  eventsByDay: Map<string, EventRecord[]>
): DayCell[] {
  const monthStart = startOfMonth(cursor);
  const today = startOfDay(new Date());

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = localDateKey(date);
    cells.push({
      date,
      inMonth: date.getMonth() === cursor.getMonth(),
      isToday: isSameDay(date, today),
      releases: releasesByDay.get(key) ?? [],
      events: eventsByDay.get(key) ?? [],
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

function eventDotClasses(event: EventRecord): string {
  // Squares vs circles distinguish events from releases at small sizes;
  // dashed border on pending signals "not yet trusted."
  const base = 'h-1.5 w-1.5 rounded-sm shrink-0';
  if (event.confirmationStatus === 'pending') {
    return cn(base, 'border border-dashed border-amber-400/80 bg-transparent');
  }
  if (event.confirmationStatus === 'rejected') {
    return cn(base, 'bg-quaternary-token/40');
  }
  return cn(base, 'bg-violet-400');
}

function formatReviewedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CalendarPageClient() {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filter, setFilter] = useState<FilterChip>('all');
  const [selectedPendingIds, setSelectedPendingIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const [, startTransition] = useTransition();

  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';
  const queryClient = useQueryClient();
  const { data: releases, isLoading: isLoadingReleases } =
    useRecentReleasesQuery(profileId);
  const { data: events, isLoading: isLoadingEvents } =
    useEventsQuery(profileId);

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

  const eventsByDay = useMemo<Map<string, EventRecord[]>>(() => {
    const map = new Map<string, EventRecord[]>();
    if (!events) return map;
    for (const e of events) {
      try {
        const key = getEventLocalDateKey({
          startDate: e.eventDate,
          timezone: e.timezone,
        });
        const list = map.get(key);
        if (list) list.push(e);
        else map.set(key, [e]);
      } catch {
        // Skip events with unparseable dates rather than crashing the grid.
      }
    }
    return map;
  }, [events]);

  const grid = useMemo(
    () => buildMonthGrid(cursor, releasesByDay, eventsByDay),
    [cursor, releasesByDay, eventsByDay]
  );

  const pendingCount = useMemo(
    () =>
      events
        ? events.filter(e => e.confirmationStatus === 'pending').length
        : 0,
    [events]
  );

  const selectedReleases = useMemo<ReleaseDot[]>(() => {
    if (!selectedDay) return [];
    const key = localDateKey(selectedDay);
    return releasesByDay.get(key) ?? [];
  }, [selectedDay, releasesByDay]);

  const selectedEvents = useMemo<EventRecord[]>(() => {
    if (!selectedDay) return [];
    const key = localDateKey(selectedDay);
    return eventsByDay.get(key) ?? [];
  }, [selectedDay, eventsByDay]);

  const confirmedSelectedEvents = useMemo(
    () => selectedEvents.filter(e => e.confirmationStatus === 'confirmed'),
    [selectedEvents]
  );
  const pendingSelectedEvents = useMemo(
    () => selectedEvents.filter(e => e.confirmationStatus === 'pending'),
    [selectedEvents]
  );
  const rejectedSelectedEvents = useMemo(
    () => selectedEvents.filter(e => e.confirmationStatus === 'rejected'),
    [selectedEvents]
  );

  const invalidateEvents = useCallback(() => {
    if (!profileId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.events.list(profileId),
    });
  }, [profileId, queryClient]);

  const handleConfirm = useCallback(
    (id: string) => {
      startTransition(async () => {
        await confirmEvent(id);
        invalidateEvents();
      });
    },
    [invalidateEvents]
  );

  const handleReject = useCallback(
    (id: string) => {
      startTransition(async () => {
        await rejectEvent(id);
        invalidateEvents();
      });
    },
    [invalidateEvents]
  );

  const handleUndoReject = useCallback(
    (id: string) => {
      startTransition(async () => {
        await undoRejectEvent(id);
        invalidateEvents();
      });
    },
    [invalidateEvents]
  );

  const togglePendingSelected = useCallback((id: string) => {
    setSelectedPendingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkConfirm = useCallback(() => {
    const ids = [...selectedPendingIds];
    if (ids.length === 0) return;
    startTransition(async () => {
      await confirmEvents(ids);
      setSelectedPendingIds(new Set());
      invalidateEvents();
    });
  }, [selectedPendingIds, invalidateEvents]);

  const handleBulkReject = useCallback(() => {
    const ids = [...selectedPendingIds];
    if (ids.length === 0) return;
    startTransition(async () => {
      await rejectEvents(ids);
      setSelectedPendingIds(new Set());
      invalidateEvents();
    });
  }, [selectedPendingIds, invalidateEvents]);

  // Filter chip predicates applied at the cell-render layer.
  const cellShowsRelease = filter === 'all' || filter === 'releases';
  const cellShowsEvent = (e: EventRecord): boolean => {
    if (filter === 'releases') return false;
    if (filter === 'needs_review') return e.confirmationStatus === 'pending';
    return true; // 'all' and 'events'
  };

  const isLoading = isLoadingReleases || isLoadingEvents;

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
          Releases and events — month at a glance.
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

        <div className='ml-auto flex items-center gap-1'>
          <FilterPill
            label='All'
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterPill
            label='Releases'
            active={filter === 'releases'}
            onClick={() => setFilter('releases')}
          />
          <FilterPill
            label='Events'
            active={filter === 'events'}
            onClick={() => setFilter('events')}
          />
          <FilterPill
            label={`Needs review${pendingCount > 0 ? ` · ${pendingCount}` : ''}`}
            active={filter === 'needs_review'}
            onClick={() => setFilter('needs_review')}
            tone={pendingCount > 0 ? 'warn' : 'default'}
          />
        </div>
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
            const key = localDateKey(cell.date);
            const visibleReleases = cellShowsRelease ? cell.releases : [];
            const visibleEvents = cell.events.filter(cellShowsEvent);
            const hasContent =
              visibleReleases.length > 0 || visibleEvents.length > 0;
            const isSelected = selectedDay && isSameDay(cell.date, selectedDay);
            const totalShown = Math.min(
              3,
              visibleReleases.length + visibleEvents.length
            );
            const overflow =
              visibleReleases.length + visibleEvents.length - totalShown;
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
                {hasContent && (
                  <div className='flex flex-col gap-1 w-full'>
                    {visibleReleases.slice(0, 3).map(r => (
                      <div
                        key={`r-${r.id}`}
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
                    {visibleEvents
                      .slice(0, Math.max(0, 3 - visibleReleases.length))
                      .map(e => (
                        <div
                          key={`e-${e.id}`}
                          className='flex items-center gap-1.5 min-w-0'
                          title={`${EVENT_TYPE_LABEL[e.eventType]} · ${e.subtitle}${e.confirmationStatus === 'pending' ? ' · pending review' : ''}`}
                        >
                          <span
                            aria-hidden='true'
                            className={eventDotClasses(e)}
                          />
                          <span
                            className={cn(
                              'text-[10.5px] truncate',
                              e.confirmationStatus === 'pending'
                                ? 'text-tertiary-token italic'
                                : e.confirmationStatus === 'rejected'
                                  ? 'text-quaternary-token line-through'
                                  : 'text-secondary-token'
                            )}
                          >
                            {e.title}
                          </span>
                        </div>
                      ))}
                    {overflow > 0 && (
                      <span className='text-[10px] text-quaternary-token'>
                        +{overflow} more
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

          {/* Releases */}
          {selectedReleases.length > 0 && (
            <div className='mt-3'>
              <h4 className='text-[11px] font-caption uppercase tracking-[0.06em] text-quaternary-token'>
                Releases
              </h4>
              <ul className='mt-2 flex flex-col gap-2'>
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
            </div>
          )}

          {/* Confirmed events */}
          {confirmedSelectedEvents.length > 0 && (
            <div className='mt-4'>
              <h4 className='text-[11px] font-caption uppercase tracking-[0.06em] text-quaternary-token'>
                Events
              </h4>
              <ul className='mt-2 flex flex-col gap-2'>
                {confirmedSelectedEvents.map(e => (
                  <EventRow
                    key={e.id}
                    event={e}
                    variant='confirmed'
                    onReject={() => handleReject(e.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Pending events — the trust queue */}
          {pendingSelectedEvents.length > 0 && (
            <div className='mt-4'>
              <div className='flex items-center justify-between'>
                <h4 className='text-[11px] font-caption uppercase tracking-[0.06em] text-amber-400/90'>
                  Pending review · {pendingSelectedEvents.length}
                </h4>
              </div>
              <ul className='mt-2 flex flex-col gap-2'>
                {pendingSelectedEvents.map(e => (
                  <EventRow
                    key={e.id}
                    event={e}
                    variant='pending'
                    selected={selectedPendingIds.has(e.id)}
                    onToggleSelect={() => togglePendingSelected(e.id)}
                    onConfirm={() => handleConfirm(e.id)}
                    onReject={() => handleReject(e.id)}
                  />
                ))}
              </ul>
              {selectedPendingIds.size > 0 && (
                <div className='mt-3 flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={handleBulkConfirm}
                    className='h-7 px-3 rounded-md text-[12px] font-caption bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors'
                  >
                    Confirm selected ({selectedPendingIds.size})
                  </button>
                  <button
                    type='button'
                    onClick={handleBulkReject}
                    className='h-7 px-3 rounded-md text-[12px] font-caption bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors'
                  >
                    Reject selected ({selectedPendingIds.size})
                  </button>
                  <button
                    type='button'
                    onClick={() => setSelectedPendingIds(new Set())}
                    className='h-7 px-2 rounded-md text-[11px] text-tertiary-token hover:text-primary-token transition-colors'
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rejected events — collapsed by default */}
          {rejectedSelectedEvents.length > 0 && (
            <div className='mt-4'>
              <button
                type='button'
                onClick={() => setShowRejected(s => !s)}
                className='text-[11px] font-caption uppercase tracking-[0.06em] text-quaternary-token hover:text-tertiary-token transition-colors'
              >
                {showRejected
                  ? 'Hide rejected'
                  : `Show rejected · ${rejectedSelectedEvents.length}`}
              </button>
              {showRejected && (
                <ul className='mt-2 flex flex-col gap-2'>
                  {rejectedSelectedEvents.map(e => (
                    <EventRow
                      key={e.id}
                      event={e}
                      variant='rejected'
                      onUndoReject={() => handleUndoReject(e.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedReleases.length === 0 && selectedEvents.length === 0 && (
            <p className='mt-2 text-[12px] text-tertiary-token'>
              Nothing on this day.
            </p>
          )}
        </section>
      )}

      {isLoading && (
        <div className='text-[12px] text-quaternary-token'>
          Loading calendar…
        </div>
      )}
    </div>
  );
}

function FilterPill(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'warn';
}) {
  return (
    <button
      type='button'
      onClick={props.onClick}
      className={cn(
        'h-7 px-3 rounded-md text-[11.5px] font-caption transition-colors duration-150 ease-out',
        props.active
          ? props.tone === 'warn'
            ? 'bg-amber-400/15 text-amber-300'
            : 'bg-surface-1/70 text-primary-token'
          : 'text-tertiary-token hover:text-primary-token hover:bg-surface-1/40'
      )}
    >
      {props.label}
    </button>
  );
}

interface EventRowProps {
  readonly event: EventRecord;
  readonly variant: 'confirmed' | 'pending' | 'rejected';
  readonly selected?: boolean;
  readonly onToggleSelect?: () => void;
  readonly onConfirm?: () => void;
  readonly onReject?: () => void;
  readonly onUndoReject?: () => void;
}

function EventRow(props: EventRowProps) {
  const { event } = props;
  const reviewedLabel = formatReviewedAt(event.reviewedAt);
  return (
    <li className='flex items-start gap-3 rounded-lg border border-(--linear-app-shell-border)/60 p-3'>
      {props.variant === 'pending' && props.onToggleSelect && (
        <input
          type='checkbox'
          checked={!!props.selected}
          onChange={props.onToggleSelect}
          aria-label={`Select ${event.title}`}
          className='mt-1 h-3.5 w-3.5 accent-amber-400 cursor-pointer'
        />
      )}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2 flex-wrap'>
          <span className='text-[12.5px] font-caption text-primary-token truncate'>
            {event.title}
          </span>
          <ProviderChip provider={event.provider ?? 'Manual'} />
          <TypeChip type={event.eventType} />
          {event.status && (
            <span className='text-[10.5px] text-amber-400/90 uppercase tracking-[0.04em]'>
              {event.status}
            </span>
          )}
        </div>
        <div className='mt-1 text-[10.5px] text-tertiary-token'>
          {event.subtitle}
        </div>
        {props.variant === 'pending' && event.lastSyncedAt && (
          <div className='mt-1 text-[10px] text-quaternary-token'>
            Last synced {formatReviewedAt(event.lastSyncedAt)}
          </div>
        )}
        {props.variant === 'confirmed' && reviewedLabel && (
          <div className='mt-1 text-[10px] text-quaternary-token'>
            Reviewed {reviewedLabel}
          </div>
        )}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        {event.ticketUrl && props.variant !== 'rejected' && (
          <a
            href={event.ticketUrl}
            target='_blank'
            rel='noreferrer'
            className='h-7 px-2 grid place-items-center rounded-md text-[11px] text-tertiary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors'
          >
            Tickets
          </a>
        )}
        {props.variant === 'pending' && (
          <>
            <button
              type='button'
              onClick={props.onConfirm}
              className='h-7 px-3 rounded-md text-[11px] font-caption bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors'
            >
              Confirm
            </button>
            <button
              type='button'
              onClick={props.onReject}
              className='h-7 px-3 rounded-md text-[11px] font-caption bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors'
            >
              Reject
            </button>
          </>
        )}
        {props.variant === 'confirmed' && props.onReject && (
          <button
            type='button'
            onClick={props.onReject}
            className='h-7 px-2 rounded-md text-[11px] text-tertiary-token hover:text-red-300 hover:bg-red-500/10 transition-colors'
          >
            Reject
          </button>
        )}
        {props.variant === 'rejected' && props.onUndoReject && (
          <button
            type='button'
            onClick={props.onUndoReject}
            className='h-7 px-3 rounded-md text-[11px] font-caption bg-surface-1/70 text-tertiary-token hover:text-primary-token transition-colors'
          >
            Undo reject
          </button>
        )}
      </div>
    </li>
  );
}

function ProviderChip({ provider }: { provider: string }) {
  return (
    <span className='text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-surface-1/60 text-quaternary-token'>
      {provider}
    </span>
  );
}

function TypeChip({ type }: { type: EventRecord['eventType'] }) {
  return (
    <span className='text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-violet-400/15 text-violet-300'>
      {EVENT_TYPE_LABEL[type]}
    </span>
  );
}
