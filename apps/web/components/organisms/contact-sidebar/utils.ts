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

// Platform-specific hostname sets
const TIKTOK_HOSTS = new Set(['tiktok.com']);
const SNAPCHAT_HOSTS = new Set(['snapchat.com']);
const YOUTUBE_HOSTS = new Set(['youtube.com']);
const SPOTIFY_HOSTS = new Set(['spotify.com', 'open.spotify.com']);

// Common path segments that aren't usernames
const IGNORED_SEGMENTS = new Set([
  'artist',
  'user',
  'channel',
  'c',
  'profile',
  'watch',
]);

// Helper to strip @ prefix from username
function stripAtPrefix(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

// Platform-specific username extractors
function extractFromTikTok(first: string): string | null {
  const candidate = stripAtPrefix(first);
  return candidate || null;
}

function extractFromSnapchat(first: string, second: string): string | null {
  const candidate = first === 'add' || first === 'u' ? second : first;
  const cleaned = stripAtPrefix(candidate);
  return cleaned || null;
}

function extractFromYouTube(first: string): string | null {
  if (first.startsWith('@')) return first.slice(1) || null;
  return null;
}

function extractFromSpotify(first: string, second: string): string | null {
  if (first === 'artist') return null;
  if (first === 'user' && second) return second;
  return null;
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

    // Dispatch to platform-specific extractors
    if (TIKTOK_HOSTS.has(host)) return extractFromTikTok(first);
    if (SNAPCHAT_HOSTS.has(host)) return extractFromSnapchat(first, second);
    if (YOUTUBE_HOSTS.has(host)) return extractFromYouTube(first);
    if (SPOTIFY_HOSTS.has(host)) return extractFromSpotify(first, second);

    // Filter out common ignored segments for generic URLs
    if (IGNORED_SEGMENTS.has(first.toLowerCase())) return null;

    const candidate = stripAtPrefix(first);
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

  const segments = trimmed
    .replace(/^https?:\/\//, '')
    .split('/')
    .filter(Boolean);
  const lastSegment = segments.at(-1);

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
