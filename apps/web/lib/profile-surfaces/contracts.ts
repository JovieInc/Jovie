export const PROFILE_SURFACE_KINDS = [
  'jovie',
  'website',
  'social',
  'dsp',
  'authority',
] as const;

export type ProfileSurfaceKind = (typeof PROFILE_SURFACE_KINDS)[number];

export const PROFILE_QUALIFICATION_STATUSES = [
  'suggested',
  'qualified',
  'conflicting',
  'rejected',
] as const;

export type ProfileQualificationStatus =
  (typeof PROFILE_QUALIFICATION_STATUSES)[number];

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'si',
]);

const CANONICAL_HOSTS: Readonly<Record<string, string>> = {
  'm.facebook.com': 'facebook.com',
  'mobile.twitter.com': 'x.com',
  'music.apple.com': 'music.apple.com',
  'open.spotify.com': 'open.spotify.com',
  'twitter.com': 'x.com',
  'www.facebook.com': 'facebook.com',
  'www.instagram.com': 'instagram.com',
  'www.tiktok.com': 'tiktok.com',
  'www.youtube.com': 'youtube.com',
};

export const SHARED_PROFILE_HOSTS = new Set([
  'facebook.com',
  'genius.com',
  'instagram.com',
  'music.apple.com',
  'musicbrainz.org',
  'open.spotify.com',
  'soundcloud.com',
  'tiktok.com',
  'wikipedia.org',
  'x.com',
  'youtube.com',
]);

export interface CanonicalSurfaceUrl {
  readonly url: string;
  readonly hostname: string;
  readonly isSharedHost: boolean;
}

/**
 * Canonicalize a public profile URL without performing network I/O.
 * Returns null for unsafe schemes, credentials, or invalid URLs.
 */
export function canonicalizeSurfaceUrl(
  input: string
): CanonicalSurfaceUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;

  parsed.protocol = 'https:';
  parsed.hostname = canonicalizeHostname(parsed.hostname);
  parsed.port = '';
  parsed.hash = '';

  for (const key of [...parsed.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.startsWith('utm_') ||
      TRACKING_PARAMS.has(normalizedKey)
    ) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();

  parsed.pathname =
    parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';

  return {
    url: parsed.toString(),
    hostname: parsed.hostname,
    isSharedHost: isSharedProfileHost(parsed.hostname),
  };
}

function canonicalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (CANONICAL_HOSTS[lower]) return CANONICAL_HOSTS[lower];
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

export function isSharedProfileHost(hostname: string): boolean {
  const canonical = canonicalizeHostname(hostname);
  return [...SHARED_PROFILE_HOSTS].some(
    shared => canonical === shared || canonical.endsWith(`.${shared}`)
  );
}

export interface MonitoringCandidate {
  readonly id: string;
  readonly kind: ProfileSurfaceKind;
  readonly platform: string;
  readonly qualificationStatus: ProfileQualificationStatus;
  readonly isOfficial: boolean;
  readonly userPaused?: boolean;
}

const SOCIAL_PRIORITY = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'facebook',
] as const;

const DSP_PRIORITY = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'bandcamp',
] as const;

/** Deterministic launch order. Jovie is first-party and never consumes a slot. */
export function selectDefaultMonitoredSurfaceIds(
  candidates: readonly MonitoringCandidate[],
  limit: number | null
): string[] {
  const eligible = candidates.filter(
    candidate =>
      candidate.kind !== 'jovie' &&
      candidate.qualificationStatus === 'qualified' &&
      !candidate.userPaused
  );

  const ordered = [...eligible].sort((a, b) => {
    const priorityDelta = monitoringPriority(a) - monitoringPriority(b);
    return priorityDelta || a.id.localeCompare(b.id);
  });

  return (limit === null ? ordered : ordered.slice(0, Math.max(0, limit))).map(
    candidate => candidate.id
  );
}

function monitoringPriority(candidate: MonitoringCandidate): number {
  if (candidate.kind === 'website' && candidate.isOfficial) return 0;
  if (candidate.kind === 'social') {
    const position = SOCIAL_PRIORITY.indexOf(
      candidate.platform as (typeof SOCIAL_PRIORITY)[number]
    );
    return 100 + (position === -1 ? SOCIAL_PRIORITY.length : position);
  }
  if (candidate.kind === 'dsp') {
    const position = DSP_PRIORITY.indexOf(
      candidate.platform as (typeof DSP_PRIORITY)[number]
    );
    return 200 + (position === -1 ? DSP_PRIORITY.length : position);
  }
  if (candidate.kind === 'authority') return 300;
  return 400;
}
