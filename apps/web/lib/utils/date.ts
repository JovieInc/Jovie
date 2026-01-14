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
