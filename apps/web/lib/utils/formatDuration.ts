/**
 * Format milliseconds as mm:ss or hh:mm:ss
 *
 * @param ms Duration in milliseconds
 * @returns Formatted duration string (e.g., "3:45" or "1:23:45")
 *
 * @example
 * formatDuration(225000) // "3:45"
 * formatDuration(5025000) // "1:23:45"
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
