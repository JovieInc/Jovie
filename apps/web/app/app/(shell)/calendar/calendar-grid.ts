import type { EventRecord } from '@/lib/events/event-record';

export interface ReleaseDot {
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

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function localDateKey(d: Date): string {
  // YYYY-MM-DD in local time so day buckets line up with the grid cell
  // shown to the creator. Releases and events intentionally share this key
  // space so Map lookups use the same day buckets as the visible grid.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildMonthGrid(
  cursor: Date,
  todayMs: number | null,
  releasesByDay: Map<string, ReleaseDot[]>,
  eventsByDay: Map<string, EventRecord[]>
): DayCell[] {
  const monthStart = startOfMonth(cursor);

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
      isToday: date.getTime() === todayMs,
      releases: releasesByDay.get(key) ?? [],
      events: eventsByDay.get(key) ?? [],
    });
  }
  return cells;
}
