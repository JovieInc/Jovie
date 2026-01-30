/**
 * Account Settings Utilities
 *
 * Shared utility functions for account settings components.
 */

import { fetchWithTimeout } from '@/lib/queries/fetch';

/**
 * Format a date as a relative time string (e.g., "2 hours ago").
 */
export function formatRelativeDate(value: Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
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
