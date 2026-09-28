/**
 * Account Settings Utilities
 *
 * Shared utility functions for account settings components.
 */

import { fetchWithTimeout } from '@/lib/queries';

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

/**
 * Format a date as a relative time string (e.g., "2 hours ago").
 */
export function formatRelativeDate(value: Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const formatter = relativeTimeFormatter;
  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return formatter.format(days, 'day');
}

const UA_BROWSER_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/edg(a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/fxios|firefox/i, 'Firefox'],
  [/crios|chrome/i, 'Chrome'],
  [/version\/.*safari/i, 'Safari'],
];

const UA_PLATFORM_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/iphone/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/android/i, 'Android'],
  [/mac os x/i, 'Mac'],
  [/windows/i, 'Windows'],
  [/linux/i, 'Linux'],
];

/**
 * Parse a raw `User-Agent` header (Better Auth session row) into a short,
 * human-readable label. Also accepts a bare browser name for legacy callers.
 */
export function formatSessionDeviceName(
  userAgent: string | null | undefined
): string {
  const trimmed = userAgent?.trim();
  if (!trimmed) return 'Unknown device';

  if (/electron|jovie\s*desktop|joviedesktop/i.test(trimmed)) {
    return 'Mac OS';
  }

  const browser = UA_BROWSER_PATTERNS.find(([pattern]) =>
    pattern.test(trimmed)
  )?.[1];
  const platform = UA_PLATFORM_PATTERNS.find(([pattern]) =>
    pattern.test(trimmed)
  )?.[1];

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;

  // Not a real UA string (e.g. a bare legacy browser name) — return as-is.
  return trimmed;
}

/**
 * Extract a user-friendly error message from various error types.
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';
  if (error instanceof Error) {
    return error.message || 'Something went wrong. Please try again.';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const clerkErrors = (error as { errors?: Array<{ message?: string }> })
      .errors;
    if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
      return clerkErrors[0]?.message ?? 'Unable to complete request.';
    }
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Sync an email address to the database.
 */
export async function syncEmailToDatabase(email: string): Promise<void> {
  await fetchWithTimeout<{ success: boolean }>('/api/account/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}
