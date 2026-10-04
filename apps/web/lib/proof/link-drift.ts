/**
 * Link-drift computed proof (JOV-7794 follow-up, JOV-7750 proof system).
 *
 * The single most persuasive line across four persona-judge rounds was a
 * drift finding about the visitor ("your bio link still points to your last
 * single"). This module compares the visitor's public link-in-bio targets
 * with their release catalog, DSP profiles and link health, and returns only
 * findings it can source. Pure: the server layer gathers the inputs.
 *
 * Every finding names its source and when it was observed. No finding is a
 * valid outcome; the proof slot then hides.
 */

export type LinkPlatform =
  | 'spotify'
  | 'apple_music'
  | 'deezer'
  | 'youtube'
  | 'soundcloud'
  | 'tidal'
  | 'amazon_music'
  | 'bandcamp'
  | 'instagram'
  | 'tiktok';

/** Display names for the user-facing copy (Jovie's own wording). */
export const LINK_PLATFORM_LABELS: Readonly<Record<LinkPlatform, string>> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  deezer: 'Deezer',
  youtube: 'YouTube',
  soundcloud: 'SoundCloud',
  tidal: 'TIDAL',
  amazon_music: 'Amazon Music',
  bandcamp: 'Bandcamp',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const HOST_PLATFORMS: ReadonlyArray<readonly [RegExp, LinkPlatform]> = [
  [/(^|\.)spotify\.com$|(^|\.)spotify\.link$/u, 'spotify'],
  [/(^|\.)music\.apple\.com$|(^|\.)itunes\.apple\.com$/u, 'apple_music'],
  [/(^|\.)deezer\.com$|(^|\.)deezer\.page\.link$/u, 'deezer'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/u, 'youtube'],
  [/(^|\.)soundcloud\.com$/u, 'soundcloud'],
  [/(^|\.)tidal\.com$/u, 'tidal'],
  [/(^|\.)music\.amazon\.[a-z.]+$/u, 'amazon_music'],
  [/(^|\.)bandcamp\.com$/u, 'bandcamp'],
  [/(^|\.)instagram\.com$/u, 'instagram'],
  [/(^|\.)tiktok\.com$/u, 'tiktok'],
];

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function linkPlatform(url: string): LinkPlatform | null {
  const host = parseUrl(url)?.hostname.toLowerCase();
  if (!host) return null;
  return HOST_PLATFORMS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

export type SpotifyRef = {
  readonly kind: 'artist' | 'album' | 'track';
  readonly id: string;
} | null;

/** open.spotify.com/{intl-xx/}{artist|album|track}/{id} */
export function parseSpotifyRef(url: string): SpotifyRef {
  const parsed = parseUrl(url);
  if (!parsed || !/(^|\.)open\.spotify\.com$/u.test(parsed.hostname)) {
    return null;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  // Localized links carry a leading `intl-xx` segment.
  if (segments[0]?.startsWith('intl-')) segments.shift();
  const [kind, id] = segments;
  if (
    (kind !== 'artist' && kind !== 'album' && kind !== 'track') ||
    !id ||
    !/^[A-Za-z0-9]{22}$/u.test(id)
  ) {
    return null;
  }
  return { kind, id };
}

export interface BioLink {
  readonly url: string;
  readonly title?: string | null;
}

export interface CatalogRelease {
  readonly id: string;
  readonly title: string;
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD as the DSP reports it). */
  readonly releaseDate: string;
}

/** A bio link resolved to the release it points at. */
export interface LinkedRelease {
  readonly url: string;
  readonly release: CatalogRelease;
}

export type LinkHealthStatus = 'ok' | 'dead' | 'homepage-redirect' | 'unknown';

export interface LinkHealth {
  readonly url: string;
  readonly status: LinkHealthStatus;
  readonly httpStatus?: number;
  readonly finalUrl?: string;
}

export interface LinkDriftInput {
  /** The public link-in-bio page that was read. */
  readonly bioPageUrl: string;
  readonly bioFetchedAt: string;
  readonly bioLinks: readonly BioLink[];
  /** The artist's releases from the DSP catalog, any order. */
  readonly catalog: readonly CatalogRelease[];
  readonly catalogSource: string;
  readonly catalogFetchedAt: string | null;
  /** Bio links resolved to catalog releases. */
  readonly linkedReleases: readonly LinkedRelease[];
  /** DSP profiles the visitor verifiably has (confirmed matches). */
  readonly dspProfiles: readonly {
    readonly platform: LinkPlatform;
    readonly url: string;
  }[];
  readonly health: readonly LinkHealth[];
  readonly healthCheckedAt: string | null;
  readonly now: string;
}

export type LinkDriftKind =
  | 'stale-release-link'
  | 'broken-links'
  | 'missing-platform';

export interface LinkDriftFinding {
  readonly kind: LinkDriftKind;
  readonly label: string;
  readonly value: string;
  readonly source: string;
  readonly observedAt: string;
}

/** A newer release must be at least this much newer to count as drift. */
export const STALE_RELEASE_MIN_DAYS = 14;

function releaseTime(date: string): number {
  const [year, month = '01', day = '01'] = date.split('-');
  return Date.parse(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`
  );
}

function formatMonth(date: string): string {
  const time = releaseTime(date);
  if (Number.isNaN(time)) return date;
  return new Date(time).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function latestRelease(
  catalog: readonly CatalogRelease[],
  now: string
): CatalogRelease | null {
  const nowTime = Date.parse(now);
  return (
    [...catalog]
      .filter(release => !Number.isNaN(releaseTime(release.releaseDate)))
      .filter(release => releaseTime(release.releaseDate) <= nowTime)
      .sort(
        (left, right) =>
          releaseTime(right.releaseDate) - releaseTime(left.releaseDate) ||
          left.id.localeCompare(right.id)
      )[0] ?? null
  );
}

function staleReleaseFinding(input: LinkDriftInput): LinkDriftFinding | null {
  const latest = latestRelease(input.catalog, input.now);
  if (!latest || input.linkedReleases.length === 0) return null;
  // If any bio link already points at the latest release, nothing is stale.
  if (input.linkedReleases.some(linked => linked.release.id === latest.id)) {
    return null;
  }
  const newestLinked = [...input.linkedReleases].sort(
    (left, right) =>
      releaseTime(right.release.releaseDate) -
      releaseTime(left.release.releaseDate)
  )[0];
  if (!newestLinked) return null;
  const gapDays =
    (releaseTime(latest.releaseDate) -
      releaseTime(newestLinked.release.releaseDate)) /
    86_400_000;
  if (!(gapDays >= STALE_RELEASE_MIN_DAYS)) return null;
  return {
    kind: 'stale-release-link',
    label: 'Bio link',
    value: `Points to “${newestLinked.release.title}” (${formatMonth(newestLinked.release.releaseDate)}). Your latest, “${latest.title}”, came out ${formatMonth(latest.releaseDate)}.`,
    source: `${input.bioPageUrl} vs ${input.catalogSource}`,
    observedAt: input.catalogFetchedAt ?? input.bioFetchedAt,
  };
}

function brokenLinksFinding(input: LinkDriftInput): LinkDriftFinding | null {
  const checked = input.health.filter(item => item.status !== 'unknown');
  const broken = checked.filter(
    item => item.status === 'dead' || item.status === 'homepage-redirect'
  );
  if (broken.length === 0 || !input.healthCheckedAt) return null;
  const dead = broken.filter(item => item.status === 'dead').length;
  const redirected = broken.length - dead;
  const parts = [
    dead > 0 ? `${dead} dead` : null,
    redirected > 0 ? `${redirected} redirect to a homepage` : null,
  ].filter(Boolean);
  return {
    kind: 'broken-links',
    label: 'Broken links',
    value: `${broken.length} of your ${checked.length} bio links (${parts.join(', ')})`,
    source: input.bioPageUrl,
    observedAt: input.healthCheckedAt,
  };
}

function missingPlatformFindings(
  input: LinkDriftInput
): readonly LinkDriftFinding[] {
  const present = new Set(
    input.bioLinks
      .map(link => linkPlatform(link.url))
      .filter((platform): platform is LinkPlatform => platform !== null)
  );
  const seen = new Set<LinkPlatform>();
  return input.dspProfiles.flatMap(profile => {
    if (present.has(profile.platform) || seen.has(profile.platform)) return [];
    seen.add(profile.platform);
    return [
      {
        kind: 'missing-platform' as const,
        label: 'Missing link',
        value: `Your ${LINK_PLATFORM_LABELS[profile.platform]} profile is not on your bio link page`,
        source: `${input.bioPageUrl} vs ${profile.url}`,
        observedAt: input.bioFetchedAt,
      },
    ];
  });
}

/** All sourced drift findings, most persuasive first. */
export function detectLinkDrift(
  input: LinkDriftInput
): readonly LinkDriftFinding[] {
  return [
    staleReleaseFinding(input),
    brokenLinksFinding(input),
    ...missingPlatformFindings(input),
  ].filter((finding): finding is LinkDriftFinding => finding !== null);
}
