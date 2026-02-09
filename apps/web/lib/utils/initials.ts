/**
 * Extract up to 2 initials from a name string.
 *
 * @example
 * getInitials('John Doe')   // 'JD'
 * getInitials('Madonna')    // 'M'
 * getInitials('The Weeknd') // 'TW'
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
