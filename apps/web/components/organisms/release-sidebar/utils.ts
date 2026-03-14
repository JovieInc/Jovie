/**
 * ReleaseSidebar Utility Functions
 *
 * Helper functions for form handling and URL validation.
 */

export {
  formatReleaseArtistLine,
  formatReleaseDate,
  formatReleaseDateShort,
} from '@/lib/discography/formatting';

/**
 * Check if an event target is a form element (input, textarea, select, button)
 */
export function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON'
  );
}

/**
 * Validate if a string is a valid HTTP/HTTPS URL
 */
export function isValidUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const protocol = url.protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
