/**
 * Format an event startDate for schema.org with an explicit timezone offset.
 * Google Event rich results require ISO 8601 with offset when a venue timezone is known.
 */
export function formatSchemaEventStartDate(
  startDate: string,
  timezone: string | null
): string {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) {
    return startDate;
  }

  if (!timezone) {
    return startDate;
  }

  try {
    const localFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const localParts = localFormatter.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      localParts.find(part => part.type === type)?.value ?? '00';

    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    const offsetRaw =
      offsetFormatter
        .formatToParts(date)
        .find(part => part.type === 'timeZoneName')?.value ?? 'GMT';

    const offset = normalizeGmtOffset(offsetRaw);

    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`;
  } catch {
    return startDate;
  }
}

function normalizeGmtOffset(offsetRaw: string): string {
  if (offsetRaw === 'GMT' || offsetRaw === 'UTC') {
    return '+00:00';
  }

  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(offsetRaw);
  if (!match) {
    return '+00:00';
  }

  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = match[3] ?? '00';
  return `${sign}${hours}:${minutes}`;
}
