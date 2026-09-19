/** Preview-only Jovie link inspect for imported YouTube videos. */

export const YOUTUBE_DESCRIPTION_MAX_CHARS = 5000;
export const JOVIE_SMART_LINK_HOSTS = [
  'jov.ie',
  'www.jov.ie',
  'jovie.link',
  'www.jovie.link',
] as const;

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const APP_RE = /^\/(app|api|auth|login|signup)(\/|$)/i;
const YT_RE = /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/i;

export type YouTubeLinkStatus = 'verified' | 'missing' | 'stale' | 'unknown';
export type YouTubeLinkPlanAction = 'none' | 'insert' | 'replace';

export interface YouTubeLinkPlan {
  readonly status: YouTubeLinkStatus;
  readonly action: YouTubeLinkPlanAction;
  readonly nextAction: string;
  readonly currentDescription: string;
  readonly proposedDescription: string;
  readonly expectedUrl: string;
  readonly preservedDestination: string | null;
  readonly existingUrl: string | null;
  readonly existingQuery: string | null;
  readonly blockedReason:
    | 'redirect-loop'
    | 'duplicate'
    | 'description-too-long'
    | null;
}

export function buildExpectedJovieUrl(input: {
  readonly origin: string;
  readonly handle: string;
  readonly releaseSlug?: string | null;
}): string | null {
  const handle = input.handle
    .trim()
    .replace(/^@+/, '')
    .replace(/^\/+|\/+$/g, '');
  if (!handle) return null;
  const origin = input.origin.replace(/\/+$/, '');
  const slug = input.releaseSlug?.trim().replace(/^\/+|\/+$/g, '') ?? '';
  return slug ? `${origin}/${handle}/${slug}` : `${origin}/${handle}`;
}

export function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.replace(/[.,;:!?)]+$/g, ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function canonicalPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function sameResource(a: URL, b: URL): boolean {
  const host = (h: string) => h.toLowerCase().replace(/^www\./, '');
  return (
    host(a.hostname) === host(b.hostname) &&
    canonicalPath(a.pathname) === canonicalPath(b.pathname)
  );
}

function dest(url: URL): string {
  return `${url.origin}${canonicalPath(url.pathname)}`;
}

function isYt(url: URL, videoUrl: string): boolean {
  if (YT_RE.test(url.hostname)) return true;
  const video = parseHttpUrl(videoUrl);
  return video ? sameResource(url, video) : false;
}

function kind(
  url: URL,
  extra?: readonly string[]
): 'jovie' | 'unknown' | 'other' {
  const host = url.hostname.toLowerCase();
  const hosts = new Set(
    [...JOVIE_SMART_LINK_HOSTS, ...(extra ?? [])].map(h => h.toLowerCase())
  );
  if (hosts.has(host)) {
    const path = canonicalPath(url.pathname);
    return path === '/' || APP_RE.test(path) ? 'unknown' : 'jovie';
  }
  return host.includes('jov.ie') || host.includes('jovie.')
    ? 'unknown'
    : 'other';
}

function keepQuery(expected: URL, existing: URL): URL {
  const next = new URL(expected.toString());
  existing.searchParams.forEach((value, key) => {
    if (next.searchParams.has(key)) return;
    const k = key.toLowerCase();
    if (k.startsWith('utm_') || k === 'aff' || k === 'affiliate') {
      next.searchParams.set(key, value);
    }
  });
  return next;
}

export function inspectYouTubeLink(input: {
  readonly description: string | null;
  readonly expectedUrl: string;
  readonly videoUrl: string;
  readonly destinationUrl?: string | null;
  readonly extraHosts?: readonly string[];
}): YouTubeLinkPlan {
  const current = input.description ?? '';
  const expected = parseHttpUrl(input.expectedUrl);
  const landing = parseHttpUrl(input.destinationUrl ?? input.expectedUrl);
  const found = (current.match(URL_RE) ?? []).flatMap(raw => {
    const url = parseHttpUrl(raw);
    return url ? [{ raw, url, kind: kind(url, input.extraHosts) }] : [];
  });
  const none = (
    status: YouTubeLinkStatus,
    nextAction: string,
    blockedReason: YouTubeLinkPlan['blockedReason'] = null
  ): YouTubeLinkPlan => ({
    status,
    action: 'none',
    nextAction,
    currentDescription: current,
    proposedDescription: current,
    expectedUrl: input.expectedUrl,
    preservedDestination: expected ? dest(expected) : null,
    existingUrl: null,
    existingQuery: null,
    blockedReason,
  });
  if (!expected) {
    return none(
      'unknown',
      'Needs review. The expected Jovie destination could not be parsed.'
    );
  }
  if (
    isYt(expected, input.videoUrl) ||
    (landing && isYt(landing, input.videoUrl))
  ) {
    return none(
      'unknown',
      'Blocked. Inserting this destination would create a YouTube redirect loop.',
      'redirect-loop'
    );
  }
  const jovie = found.filter(item => item.kind === 'jovie');
  const matching = jovie.find(item => sameResource(item.url, expected));
  if (matching) {
    return {
      ...none(
        'verified',
        'No change. A working Jovie link is already present.',
        'duplicate'
      ),
      existingUrl: matching.url.toString(),
      existingQuery: matching.url.search || null,
    };
  }
  const unknown = found.find(item => item.kind === 'unknown');
  if (unknown && jovie.length === 0) {
    return {
      ...none(
        'unknown',
        'Needs review. A possible Jovie URL could not be verified as a smart link.'
      ),
      existingUrl: unknown.url.toString(),
      existingQuery: unknown.url.search || null,
    };
  }
  const stale = jovie.find(item => !sameResource(item.url, expected));
  if (stale) {
    const nextUrl = keepQuery(expected, stale.url);
    const proposed = current.replace(stale.raw, nextUrl.toString());
    if (proposed.length > YOUTUBE_DESCRIPTION_MAX_CHARS) {
      return {
        ...none(
          'stale',
          'Blocked. Replacing the stale Jovie link would exceed the YouTube description limit.',
          'description-too-long'
        ),
        existingUrl: stale.url.toString(),
        existingQuery: stale.url.search || null,
      };
    }
    return {
      status: 'stale',
      action: 'replace',
      nextAction:
        'Preview replace of the stale Jovie link while preserving query and affiliate parameters.',
      currentDescription: current,
      proposedDescription: proposed,
      expectedUrl: nextUrl.toString(),
      preservedDestination: dest(expected),
      existingUrl: stale.url.toString(),
      existingQuery: stale.url.search || null,
      blockedReason: null,
    };
  }
  const body = current.trimEnd();
  const proposed = body
    ? `${body}\n\nListen: ${expected}`
    : `Listen: ${expected}`;
  if (proposed.length > YOUTUBE_DESCRIPTION_MAX_CHARS) {
    return none(
      'missing',
      'Blocked. Inserting the Jovie link would exceed the YouTube description limit.',
      'description-too-long'
    );
  }
  return {
    status: 'missing',
    action: 'insert',
    nextAction: `Preview insert of ${expected.toString()}.`,
    currentDescription: current,
    proposedDescription: proposed,
    expectedUrl: expected.toString(),
    preservedDestination: dest(expected),
    existingUrl: null,
    existingQuery: null,
    blockedReason: null,
  };
}
