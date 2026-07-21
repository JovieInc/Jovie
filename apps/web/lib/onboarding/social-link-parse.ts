/**
 * Canonical social-link parse for onboarding.
 *
 * Instagram handle / URL inputs become a full HTTPS URL with an account path.
 * Bare hosts (`instagram.com`, `https://www.instagram.com/`) are rejected so
 * profile rail and tool artifacts never attach incomplete links.
 */

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'soundcloud'
  | 'spotify'
  | 'website';

export type SocialParseSuccess = {
  readonly ok: true;
  readonly platform: SocialPlatform;
  readonly handle: string | null;
  /** Full HTTPS URL including account path when required. */
  readonly url: string;
};

export type SocialParseFailure = {
  readonly ok: false;
  readonly platform?: SocialPlatform;
  readonly reason: string;
};

export type SocialParseResult = SocialParseSuccess | SocialParseFailure;

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;
const TIKTOK_HANDLE_PATTERN = /^[A-Za-z0-9._]{2,24}$/;
const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'about',
  'developer',
  'legal',
  'privacy',
  'direct',
  'tv',
]);

function stripAt(value: string): string {
  return value.replace(/^@+/, '').trim();
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

/**
 * Parse an Instagram handle or URL into a full profile URL with account path.
 * Rejects bare `instagram.com` (with or without scheme/www/trailing slash).
 */
export function parseInstagramInput(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, platform: 'instagram', reason: 'empty' };
  }

  // Bare handle (optionally @-prefixed).
  if (!raw.includes('/') && !raw.includes(':') && !raw.includes('.')) {
    const handle = stripAt(raw);
    if (!INSTAGRAM_HANDLE_PATTERN.test(handle)) {
      return {
        ok: false,
        platform: 'instagram',
        reason: 'invalid_handle',
      };
    }
    return {
      ok: true,
      platform: 'instagram',
      handle,
      url: `https://www.instagram.com/${handle}/`,
    };
  }

  // Host-only forms without a path segment: always reject.
  const hostOnly =
    /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/?$/i.test(raw) ||
    raw.toLowerCase() === 'instagram.com' ||
    raw.toLowerCase() === 'www.instagram.com';
  if (hostOnly) {
    return {
      ok: false,
      platform: 'instagram',
      reason: 'missing_account_path',
    };
  }

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    url = new URL(withScheme);
  } catch {
    return { ok: false, platform: 'instagram', reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, platform: 'instagram', reason: 'invalid_protocol' };
  }

  const host = normalizeHostname(url.hostname);
  if (host !== 'instagram.com') {
    return { ok: false, platform: 'instagram', reason: 'wrong_host' };
  }

  const segments = url.pathname
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return {
      ok: false,
      platform: 'instagram',
      reason: 'missing_account_path',
    };
  }

  const handle = stripAt(segments[0] ?? '');
  if (
    !handle ||
    INSTAGRAM_RESERVED.has(handle.toLowerCase()) ||
    !INSTAGRAM_HANDLE_PATTERN.test(handle)
  ) {
    return {
      ok: false,
      platform: 'instagram',
      reason: 'invalid_or_reserved_path',
    };
  }

  return {
    ok: true,
    platform: 'instagram',
    handle,
    url: `https://www.instagram.com/${handle}/`,
  };
}

/**
 * Parse a social handle or URL for onboarding attach flows.
 * Instagram is the strictest (must have account path). Other platforms get
 * best-effort normalization; incomplete bare hosts are rejected.
 */
export function parseSocialLinkInput(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: 'empty' };
  }

  // Explicit Instagram host or @handle without domain → Instagram parser.
  if (
    /instagram\.com/i.test(raw) ||
    (!raw.includes('/') && !raw.includes('.') && raw.startsWith('@'))
  ) {
    return parseInstagramInput(raw);
  }

  // Host-only bare domains without path.
  if (
    /^(?:https?:\/\/)?(?:www\.)?(instagram|tiktok|x|twitter|youtube|soundcloud)\.com\/?$/i.test(
      raw
    )
  ) {
    return { ok: false, reason: 'missing_account_path' };
  }

  if (
    /instagram\.com/i.test(raw) ||
    (!raw.includes('.') && !raw.includes('/'))
  ) {
    // Bare handle without @ also defaults to Instagram for onboarding.
    return parseInstagramInput(raw);
  }

  let url: URL;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_protocol' };
  }

  const host = normalizeHostname(url.hostname);
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (host === 'instagram.com') {
    return parseInstagramInput(raw);
  }

  if (host === 'tiktok.com') {
    if (pathSegments.length === 0) {
      return { ok: false, platform: 'tiktok', reason: 'missing_account_path' };
    }
    const handle = stripAt(pathSegments[0] ?? '');
    if (!TIKTOK_HANDLE_PATTERN.test(handle)) {
      return { ok: false, platform: 'tiktok', reason: 'invalid_handle' };
    }
    return {
      ok: true,
      platform: 'tiktok',
      handle,
      url: `https://www.tiktok.com/@${handle}`,
    };
  }

  if (host === 'x.com' || host === 'twitter.com') {
    if (pathSegments.length === 0) {
      return { ok: false, platform: 'x', reason: 'missing_account_path' };
    }
    const handle = stripAt(pathSegments[0] ?? '');
    if (!X_HANDLE_PATTERN.test(handle)) {
      return { ok: false, platform: 'x', reason: 'invalid_handle' };
    }
    return {
      ok: true,
      platform: 'x',
      handle,
      url: `https://x.com/${handle}`,
    };
  }

  if (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com'
  ) {
    if (pathSegments.length === 0 && host !== 'youtu.be') {
      return { ok: false, platform: 'youtube', reason: 'missing_account_path' };
    }
    url.protocol = 'https:';
    return {
      ok: true,
      platform: 'youtube',
      handle: pathSegments[0] ? stripAt(pathSegments[0]) : null,
      url: url.toString(),
    };
  }

  if (host === 'soundcloud.com') {
    if (pathSegments.length === 0) {
      return {
        ok: false,
        platform: 'soundcloud',
        reason: 'missing_account_path',
      };
    }
    url.protocol = 'https:';
    return {
      ok: true,
      platform: 'soundcloud',
      handle: pathSegments[0] ?? null,
      url: url.toString(),
    };
  }

  if (host === 'open.spotify.com' || host === 'spotify.com') {
    if (pathSegments.length < 2) {
      return { ok: false, platform: 'spotify', reason: 'missing_account_path' };
    }
    url.protocol = 'https:';
    if (host === 'spotify.com') {
      url.hostname = 'open.spotify.com';
    }
    return {
      ok: true,
      platform: 'spotify',
      handle: pathSegments[1] ?? null,
      url: url.toString(),
    };
  }

  // Generic HTTPS website with a non-empty host.
  if (host.includes('.')) {
    url.protocol = 'https:';
    return {
      ok: true,
      platform: 'website',
      handle: null,
      url: url.toString(),
    };
  }

  return { ok: false, reason: 'unrecognized' };
}

/** True when the parse produced a complete, attachable URL. */
export function isCompleteSocialUrl(input: string): boolean {
  return parseSocialLinkInput(input).ok;
}
