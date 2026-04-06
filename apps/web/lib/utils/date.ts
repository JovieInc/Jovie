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
 * Convert milliseconds to ISO 8601 duration (e.g., PT3M45S).
 */
export function msToIsoDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return 'PT0S';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (seconds > 0 || duration === 'PT') duration += `${seconds}S`;
  return duration;
}

// formatRelativeDate has been moved to @/lib/utils/date-formatting
export { formatRelativeDate } from './date-formatting';
