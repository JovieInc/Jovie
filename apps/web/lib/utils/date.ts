/**
 * Safely converts a date value to an ISO string.
 * Handles both Date objects and string representations (from cache/JSON).
 * This is useful when data may come from cache where Date objects are serialized as strings.
 *
 * @param date - A Date object or ISO string representation
 * @returns The ISO string representation
 */
export function toISOStringSafe(date: Date | string): string {
  if (typeof date === 'string') {
    return date;
  }
  return date.toISOString();
}

/**
 * Safely converts a possibly-null/undefined date to an ISO string or null.
 * Handles Date objects, ISO strings (from neon-http/cache), and null/undefined.
 */
export function toISOStringOrNull(
  date: Date | string | null | undefined
): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Safely converts a date to a date-only string (YYYY-MM-DD).
 * Handles Date objects and ISO strings from neon-http driver.
 */
export function toDateOnlySafe(date: Date | string): string {
  if (typeof date === 'string') return date.split('T')[0];
  return date.toISOString().split('T')[0];
}

/**
 * Safely converts a date to ISO string, falling back to a default value.
 * Useful when a non-null string is required regardless of input.
 */
export function toISOStringOrFallback(
  date: Date | string | null | undefined,
  fallback: string = new Date().toISOString()
): string {
  if (!date) return fallback;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Formats a date to a user-friendly relative format:
 * - "Today" for today
 * - "Yesterday" for yesterday
 * - "Jan 03" for dates in the current year
 * - "2023" for dates in prior years
 */
export function formatRelativeDate(date: Date | null | undefined): string {
  if (!date) return '—';

  const now = new Date();
  const inputDate = new Date(date);

  // Reset time to compare just dates
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const compareDate = new Date(
    inputDate.getFullYear(),
    inputDate.getMonth(),
    inputDate.getDate()
  );

  const diffTime = today.getTime() - compareDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Today
  if (diffDays === 0) {
    return 'Today';
  }

  // Yesterday
  if (diffDays === 1) {
    return 'Yesterday';
  }

  // Same year - show "Jan 03"
  if (inputDate.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
    }).format(inputDate);
  }

  // Prior year - show just the year "2023"
  return inputDate.getFullYear().toString();
}
