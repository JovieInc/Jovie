/**
 * ContactSidebar Utility Functions
 *
 * Helper functions for form handling, username extraction, and URL validation.
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
 * Format a username with @ prefix
 */
export function formatUsername(username: string | undefined): string {
  if (!username) return '';
  return username.startsWith('@') ? username : `@${username}`;
}

/**
 * Sanitize username input by trimming and removing @ prefix
 */
export function sanitizeUsernameInput(raw: string): string {
  const trimmed = raw.trim();
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return withoutAt;
}

/**
 * Extract username from a social media URL
 */
export function extractUsernameFromUrl(value: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);

    if (segments.length === 0) return null;

    const first = segments[0] ?? '';
    const second = segments[1] ?? '';

    // Common path segments that aren't usernames
    const ignoredSegments = [
      'artist',
      'user',
      'channel',
      'c',
      'profile',
      'watch',
    ];

    // Define allowed hostnames for each platform (no partials)
    const tiktokHosts = ['tiktok.com'];
    const snapchatHosts = ['snapchat.com'];
    const youtubeHosts = ['youtube.com'];
    const spotifyHosts = ['spotify.com', 'open.spotify.com'];

    if (tiktokHosts.includes(host)) {
      const candidate = first.startsWith('@') ? first.slice(1) : first;
      return candidate || null;
    }

    if (snapchatHosts.includes(host)) {
      const candidate = first === 'add' || first === 'u' ? second : first;
      const cleaned = candidate.startsWith('@')
        ? candidate.slice(1)
        : candidate;
      return cleaned || null;
    }

    if (youtubeHosts.includes(host)) {
      if (first.startsWith('@')) return first.slice(1) || null;
      return null;
    }

    // Spotify URLs: /artist/ID or /user/username
    if (spotifyHosts.includes(host)) {
      // Skip artist IDs, return null (no displayable username)
      if (first === 'artist') return null;
      // For user profiles, use the second segment
      if (first === 'user' && second) return second;
      return null;
    }

    // Filter out common ignored segments
    if (ignoredSegments.includes(first.toLowerCase())) {
      return null;
    }

    const candidate = first.startsWith('@') ? first.slice(1) : first;
    return candidate || null;
  } catch {
    return null;
  }
}

/**
 * Extract username from a label string (fallback when URL extraction fails)
 */
export function extractUsernameFromLabel(
  value: string | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const lastSegment = trimmed
    .replace(/^https?:\/\//, '')
    .split('/')
    .filter(Boolean)
    .pop();

  if (!lastSegment) return null;

  const candidate = lastSegment.startsWith('@')
    ? lastSegment.slice(1)
    : lastSegment;
  if (!candidate) return null;

  if (!/^[a-zA-Z0-9._-]{2,}$/.test(candidate)) return null;
  return candidate;
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
