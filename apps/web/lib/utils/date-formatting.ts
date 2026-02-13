/**
 * Centralized date formatting utilities.
 * Consolidates duplicated date formatting patterns across the codebase.
 */

// ============================================================================
// Pre-configured formatters for common patterns
// ============================================================================

/** Short date: "Dec 29, 2024" */
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Long date: "December 29, 2024" */
const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** Short date without year: "Dec 29" */
const shortDateNoYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

/** Date with time: "Dec 29, 2024, 14:30" */
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Time only: "14:30" */
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
});

// ============================================================================
// Core formatting functions
// ============================================================================

/**
 * Acceptable date input types
 */
export type DateInput = string | Date | null | undefined;

/**
 * Parse a date value safely.
 * @returns Date object or null if invalid
 */
export function parseDate(value: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Create a date formatter function with automatic null handling.
 * Eliminates duplication in date formatting functions.
 *
 * @param formatter - Intl.DateTimeFormat instance
 * @param fallback - Value to return for invalid dates (defaults to '—')
 * @returns Formatting function with null handling
 */
function createDateFormatter(
  formatter: Intl.DateTimeFormat,
  fallback = '—'
): (value: string | Date | null | undefined) => string {
  return (value: string | Date | null | undefined): string => {
    const date = parseDate(value);
    if (!date) return fallback;
    return formatter.format(date);
  };
}

/**
 * Format date as short format: "Dec 29, 2024"
 * Used in: blog posts, release dates, admin tables
 */
export const formatShortDate = createDateFormatter(shortDateFormatter);

/**
 * Format date as long format: "December 29, 2024"
 * Used in: blog post pages, detailed views
 */
export const formatLongDate = createDateFormatter(longDateFormatter);

/**
 * Format date without year: "Dec 29"
 * Used in: compact displays, charts
 */
export const formatShortDateNoYear = createDateFormatter(
  shortDateNoYearFormatter
);

/**
 * Format date with time: "Dec 29, 2024, 14:30"
 * Used in: activity logs, waitlist tables, timestamps
 */
export const formatDateTime = createDateFormatter(dateTimeFormatter);

/**
 * Format time only: "14:30"
 */
export const formatTime = createDateFormatter(timeFormatter);

/**
 * Format as ISO date string: "2024-12-29"
 * Used in: CSV exports, data attributes
 */
export function formatISODate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Format as ISO datetime string: "2024-12-29T14:30:00.000Z"
 * Used in: API payloads, analytics tracking
 */
export function formatISODateTime(
  value: string | Date | null | undefined
): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.toISOString();
}

// ============================================================================
// Relative time formatting
// ============================================================================

/**
 * Format as relative time: "just now", "5m ago", "2h ago", "3d ago"
 * Used in: activity feeds, last seen indicators
 */
export function formatTimeAgo(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!date) return '—';

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Format time remaining: "30 seconds", "5 minutes", "2 hours"
 * Used in: rate limit messages, countdown timers
 */
export function formatTimeRemaining(resetTime: Date | number): string {
  const resetMs =
    typeof resetTime === 'number' ? resetTime : resetTime.getTime();
  const remaining = Math.max(0, resetMs - Date.now());

  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.ceil(minutes / 60);

  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

// ============================================================================
// Specialized formatters
// ============================================================================

/**
 * Format for admin overview: "2024-12-29 14:30 UTC"
 */
export function formatTimestampUTC(
  value: string | Date | null | undefined
): string {
  const date = parseDate(value);
  if (!date) return '—';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * Format for CSV export with configurable format.
 */
export function formatDateForCSV(
  value: string | Date | null | undefined,
  format: 'iso' | 'locale' = 'iso'
): string {
  const date = parseDate(value);
  if (!date) return '';
  return format === 'iso' ? date.toISOString() : date.toLocaleString();
}

/**
 * Check if a date is today.
 */
export function isToday(value: string | Date | null | undefined): boolean {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if a date is within the last N days.
 */
export function isWithinDays(
  value: string | Date | null | undefined,
  days: number
): boolean {
  const date = parseDate(value);
  if (!date) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
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

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

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
