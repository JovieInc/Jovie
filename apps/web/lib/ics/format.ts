/**
 * Escape special characters for ICS format per RFC 5545.
 * Shared by per-event downloads and per-artist subscribe feeds.
 */
export function escapeIcsText(text: string): string {
  if (!text) return '';
  return text
    .replaceAll('\\', String.raw`\\`)
    .replaceAll(';', String.raw`\;`)
    .replaceAll(',', String.raw`\,`)
    .replaceAll('\r', '')
    .replaceAll('\n', String.raw`\n`);
}

/**
 * Format a Date as the ICS UTC timestamp form: YYYYMMDDTHHMMSSZ.
 */
export function formatIcsTimestamp(date: Date): string {
  return (
    date.toISOString().replaceAll('-', '').replaceAll(':', '').split('.')[0] +
    'Z'
  );
}

export function sanitizeIcsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/[\u0000-\u001F\u007F]/.test(url)) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
