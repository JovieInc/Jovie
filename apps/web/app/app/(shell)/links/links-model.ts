import { BASE_URL, getProfileUrl } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import type { AudienceSourceLink } from '@/lib/db/schema/analytics';
import type { SocialLink } from '@/lib/db/schema/links';
import type { ReleaseViewModel } from '@/lib/discography/types';

/**
 * One row in the Links workspace. Composes the two families of Jovie-generated
 * links — canonical smart links derived per entity (profile, releases, socials)
 * and stored trackable short links (`audience_source_links`, served at
 * `/s/{code}`) — into a single user-facing shape.
 */
export interface LinkRow {
  readonly id: string;
  /** The shareable Jovie URL the user copies and distributes. */
  readonly jovieUrl: string;
  /** Entity or link title. */
  readonly title: string;
  /** Human entity type label (release, event, social, …). */
  readonly type: string;
  /** Redirect/destination target the Jovie URL resolves to. */
  readonly destination: string;
  readonly status: 'active' | 'draft' | 'scheduled' | 'archived';
  /** Performance summary; null renders the — placeholder. */
  readonly clicks: number | null;
  /** Metric semantics, e.g. "clicks", "scans", "7d clicks". */
  readonly clicksLabel: string;
  /** Campaign/attribution context when the link carries one. */
  readonly campaign: string | null;
  /** Compact UTM summary for the row, e.g. "qr_code / print / tour-2026". */
  readonly utmSummary: string | null;
  /** App route back to the underlying entity, when resolvable. */
  readonly entityHref: string | null;
  readonly createdAt: string | null;
}

export function destinationKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'release':
      return 'Release';
    case 'tour_date':
      return 'Event';
    case 'merch':
      return 'Merch';
    case 'video':
      return 'Video';
    case 'social':
      return 'Social';
    case 'profile':
      return 'Profile';
    default:
      return 'Link';
  }
}

function releaseStatusToLinkStatus(
  status: ReleaseViewModel['status']
): LinkRow['status'] {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'scheduled':
      return 'scheduled';
    default:
      return 'active';
  }
}

export function summarizeUtmParams(
  utmParams: Record<string, string | undefined> | null | undefined
): string | null {
  if (!utmParams) return null;
  const parts = ['source', 'medium', 'campaign', 'content']
    .map(key => utmParams[key])
    .filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' / ') : null;
}

function sourceLinkEntityHref(
  link: Pick<AudienceSourceLink, 'destinationKind' | 'destinationId'>
): string | null {
  if (link.destinationKind === 'release' && link.destinationId) {
    return `${APP_ROUTES.RELEASES}/${link.destinationId}`;
  }
  if (link.destinationKind === 'tour_date') {
    return APP_ROUTES.TOUR_DATES;
  }
  return null;
}

export function buildSourceLinkRow(
  link: AudienceSourceLink,
  campaignName: string | null
): LinkRow {
  return {
    id: `source-${link.id}`,
    jovieUrl: new URL(`/s/${link.code}`, BASE_URL).toString(),
    title: link.name,
    type: destinationKindLabel(link.destinationKind),
    destination: link.destinationUrl,
    status: link.archivedAt ? 'archived' : 'active',
    clicks: link.scanCount ?? 0,
    clicksLabel: 'scans',
    campaign: campaignName,
    utmSummary: summarizeUtmParams(link.utmParams),
    entityHref: sourceLinkEntityHref(link),
    createdAt: link.createdAt?.toISOString?.() ?? null,
  };
}

export function buildReleaseLinkRow(release: ReleaseViewModel): LinkRow {
  const primaryProvider =
    release.providers.find(provider => provider.isPrimary) ??
    release.providers[0];

  return {
    id: `release-${release.id}`,
    jovieUrl: `${BASE_URL}${release.smartLinkPath}`,
    title: release.title,
    type: 'Release',
    destination: primaryProvider?.url ?? `${BASE_URL}${release.smartLinkPath}`,
    status: releaseStatusToLinkStatus(release.status),
    clicks: release.weeklyStreams ?? null,
    clicksLabel: '7d clicks',
    campaign: null,
    utmSummary: null,
    entityHref: `${APP_ROUTES.RELEASES}/${release.id}`,
    createdAt: release.releaseDate ?? null,
  };
}

export function buildProfileLinkRow(input: {
  readonly handle: string;
  readonly title: string;
  readonly clicks: number | null;
}): LinkRow {
  const url = getProfileUrl(input.handle);
  return {
    id: 'profile',
    jovieUrl: url,
    title: input.title,
    type: 'Profile',
    destination: url,
    status: 'active',
    clicks: input.clicks,
    clicksLabel: 'clicks',
    campaign: null,
    utmSummary: null,
    entityHref: APP_ROUTES.CHAT_PROFILE_PANEL,
    createdAt: null,
  };
}

export function buildSocialLinkRow(input: {
  readonly link: SocialLink;
  readonly profileUrl: string;
}): LinkRow {
  const { link, profileUrl } = input;
  return {
    id: `social-${link.id}`,
    jovieUrl: profileUrl,
    title: link.displayText ?? link.platform,
    type: 'Social',
    destination: link.url,
    status: link.isActive && link.state === 'active' ? 'active' : 'archived',
    clicks: link.clicks ?? 0,
    clicksLabel: 'clicks',
    campaign: null,
    utmSummary: null,
    entityHref: null,
    createdAt: link.createdAt?.toISOString?.() ?? null,
  };
}
