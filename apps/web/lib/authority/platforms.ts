/**
 * Authority-page platforms for claimable wiki / lyrics / encyclopedia surfaces.
 *
 * Fandom + Genius are the v1 auto-draft targets (lower notability bar).
 * Wikipedia is human-gated — draft only, never auto-publish.
 *
 * GH #14651 / parent #14650.
 */

export const AUTHORITY_PAGE_PLATFORMS = [
  'fandom',
  'genius',
  'wikipedia',
] as const;

export type AuthorityPagePlatform = (typeof AUTHORITY_PAGE_PLATFORMS)[number];

export type AuthorityPublishGate = 'agent_assisted' | 'human_only';

export interface AuthorityPlatformMeta {
  readonly id: AuthorityPagePlatform;
  readonly label: string;
  /** Prefer listing earlier platforms first when multiple gaps exist. */
  readonly priority: number;
  readonly publishGate: AuthorityPublishGate;
  /** Where a human/agent creates a new page on this platform. */
  readonly createUrlTemplate: string;
  /** Short product copy for inbox cards. */
  readonly gapWhy: string;
}

export const AUTHORITY_PLATFORM_META: Readonly<
  Record<AuthorityPagePlatform, AuthorityPlatformMeta>
> = {
  fandom: {
    id: 'fandom',
    label: 'Fandom (EDM Wiki)',
    priority: 1,
    publishGate: 'agent_assisted',
    createUrlTemplate: 'https://edm.fandom.com/wiki/Special:CreatePage',
    gapWhy:
      'Peers mention you on Fandom without a link because no artist page exists yet.',
  },
  genius: {
    id: 'genius',
    label: 'Genius',
    priority: 2,
    publishGate: 'agent_assisted',
    createUrlTemplate: 'https://genius.com/new',
    gapWhy:
      'A Genius artist page anchors lyrics, credits, and search — and is still missing.',
  },
  wikipedia: {
    id: 'wikipedia',
    label: 'Wikipedia',
    priority: 3,
    publishGate: 'human_only',
    createUrlTemplate: 'https://en.wikipedia.org/wiki/Wikipedia:Article_wizard',
    gapWhy:
      'Wikipedia sitelinks need independent notability sources. Draft only — human review required.',
  },
};

/** Platforms that product may agent-draft and assist publish in v1. */
export const AGENT_ASSISTED_AUTHORITY_PLATFORMS: readonly AuthorityPagePlatform[] =
  AUTHORITY_PAGE_PLATFORMS.filter(
    platform =>
      AUTHORITY_PLATFORM_META[platform].publishGate === 'agent_assisted'
  );

export function isAuthorityPagePlatform(
  value: unknown
): value is AuthorityPagePlatform {
  return (
    typeof value === 'string' &&
    (AUTHORITY_PAGE_PLATFORMS as readonly string[]).includes(value)
  );
}

export function resolveAuthorityCreateUrl(
  platform: AuthorityPagePlatform,
  artistName: string
): string {
  const base = AUTHORITY_PLATFORM_META[platform].createUrlTemplate;
  // Fandom CreatePage accepts a title query; others keep the generic entry URL.
  if (platform === 'fandom') {
    const title = artistName.trim().replaceAll(' ', '_');
    if (!title) return base;
    return `https://edm.fandom.com/wiki/${encodeURIComponent(title)}?action=edit&redlink=1`;
  }
  return base;
}
