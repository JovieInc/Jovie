/**
 * ReleaseSidebar Utility Functions
 *
 * Helper functions for form handling and URL validation.
 */

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

/**
 * Format a release date for display
 */
export function formatReleaseDate(date: string | undefined): string {
  if (!date) return 'Release date TBD';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Invalid date';
  }
}

/**
 * Format a release date for short display
 */
export function formatReleaseDateShort(date: string | undefined): string {
  if (!date) return 'TBD';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Invalid';
  }
}
