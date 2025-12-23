/**
 * Formats a timestamp relative to now (e.g., "2 minutes ago", "in 3 hours").
 */
export function formatRelativeTimeFromNow(value: number | Date): string {
  const target = typeof value === 'number' ? value : value.valueOf();
  if (Number.isNaN(target)) return '';

  const diff = target - Date.now();
  const absDiff = Math.abs(diff);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absDiff < 45 * 1000) {
    return diff >= 0 ? 'in a few seconds' : 'just now';
  }

  if (absDiff < 90 * 1000) {
    return diff >= 0 ? 'in a minute' : 'a minute ago';
  }

  if (absDiff < hour) {
    const minutes = Math.round(absDiff / minute);
    return diff >= 0 ? `in ${minutes} minutes` : `${minutes} minutes ago`;
  }

  if (absDiff < day) {
    const hours = Math.round(absDiff / hour);
    return diff >= 0 ? `in ${hours} hours` : `${hours} hours ago`;
  }

  const days = Math.round(absDiff / day);
  return diff >= 0 ? `in ${days} days` : `${days} days ago`;
}

/**
 * Formats a duration in milliseconds into an mm:ss or h:mm:ss string.
 */
export function formatDuration(durationMs: number): string {
  const safeDuration = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : 0;
  const totalSeconds = Math.floor(safeDuration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
