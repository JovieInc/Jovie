/**
 * Date helpers for events on the unified calendar.
 *
 * Events bucket to their **event-local date** — a show at 8pm Pacific lives
 * on that Pacific date for any viewer, regardless of viewer timezone. This
 * matches how creators talk about their schedule ("the Brooklyn show is
 * March 12") and how the existing /tour list already presents dates.
 */

/**
 * Format a Date as YYYY-MM-DD in the supplied IANA timezone.
 * Falls back through `eventTimezone` → `fallbackTimezone` → UTC.
 */
export function getEventLocalDateKey(input: {
  startDate: string | Date;
  timezone: string | null;
  fallbackTimezone?: string | null;
}): string {
  if (typeof input.startDate === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.startDate);
    if (dateOnly) {
      return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    }
  }

  const date =
    input.startDate instanceof Date
      ? input.startDate
      : new Date(input.startDate);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid event startDate');
  }
  const tz = input.timezone ?? input.fallbackTimezone ?? 'UTC';
  return formatYmdInTimezone(date, tz);
}

function formatYmdInTimezone(date: Date, timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatYmdParts(formatter.formatToParts(date));
  } catch {
    // Invalid IANA tz — fall back to UTC while keeping the same
    // year-month-day assembly logic.
    const utc = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatYmdParts(utc.formatToParts(date));
  }
}

function formatYmdParts(parts: Intl.DateTimeFormatPart[]): string {
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new TypeError('Could not format event date parts');
  }

  return `${year}-${month}-${day}`;
}
