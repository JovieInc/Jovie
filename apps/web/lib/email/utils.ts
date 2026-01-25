/**
 * Shared utilities for email templates.
 */

/**
 * Escape HTML special characters to prevent XSS in email templates.
 *
 * @param unsafe - The raw string that may contain HTML special characters
 * @returns The escaped string safe for use in HTML templates
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
