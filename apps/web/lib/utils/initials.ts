/**
 * Extract up to 2 initials from a name string.
 *
 * Defensive: trims input, filters empty tokens after split on whitespace,
 * handles empty/whitespace-only by returning empty string (callers can
 * fallback to '·' or '?').
 *
 * @example
 * getInitials('John Doe')     // 'JD'
 * getInitials('Madonna')      // 'M'
 * getInitials('The Weeknd')   // 'TW'
 * getInitials('  John  Doe ') // 'JD'
 * getInitials('')             // ''
 */
export function getInitials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
}
