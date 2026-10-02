import { getDspDisplayName } from '@/lib/dsp-registry';

export const PRESENCE_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export type PresenceIdentityPhotoKind = 'profile' | 'generic' | 'missing';
export type PresenceIdentityPhotoSource =
  | 'connector'
  | 'jovie'
  | 'public_metadata'
  | 'none';
export type PresenceIdentityPhotoFreshness = 'current' | 'stale' | 'unknown';
export type PresenceObservationStatus =
  | 'measured'
  | 'pending'
  | 'stale'
  | 'unavailable'
  | 'plan-restricted';
export type PresenceOutcomeGroup =
  | 'identity'
  | 'profiles'
  | 'catalog'
  | 'search'
  | 'connector';

export interface PresenceIdentityPhoto {
  readonly url: string | null;
  readonly source: PresenceIdentityPhotoSource;
  readonly kind: PresenceIdentityPhotoKind;
  readonly observedAt: string | null;
  readonly freshness: PresenceIdentityPhotoFreshness;
  readonly verified: boolean;
}

export interface PresenceIdentitySubject {
  readonly kind: string;
  readonly platform: string;
  readonly label: string;
  readonly handle: string | null;
  readonly url: string;
  readonly monitoringState: string;
  readonly rank?: number | null;
  readonly lastObservedAt?: string | null;
  readonly identityPhoto?: PresenceIdentityPhoto | null;
  readonly rowType?: 'surface' | 'connector';
}

export const MISSING_IDENTITY_PHOTO: PresenceIdentityPhoto = {
  url: null,
  source: 'none',
  kind: 'missing',
  observedAt: null,
  freshness: 'unknown',
  verified: false,
};

const GENERIC_METADATA_KEYS = [
  'ogImage',
  'og_image',
  'imageUrl',
  'image',
] as const;
const PROFILE_METADATA_KEYS = [
  'avatarUrl',
  'avatar_url',
  'profileImageUrl',
] as const;

function platformDisplayName(platform: string): string {
  return (
    getDspDisplayName(platform) ??
    platform
      .replaceAll('_', ' ')
      .replaceAll(/\b\w/g, letter => letter.toUpperCase())
  );
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[_-]+/g, ' ');
}

function pickHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function metadataUrl(
  metadata: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const url = pickHttpsUrl(metadata[key]);
    if (url) return url;
  }
  return null;
}

export function isPresenceObservationStale(
  observedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!observedAt) return false;
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return false;
  return now.getTime() - observed > PRESENCE_STALE_AFTER_MS;
}

export function identityPhotoFreshness(
  observedAt: string | null | undefined,
  now: Date = new Date()
): PresenceIdentityPhotoFreshness {
  if (!observedAt) return 'unknown';
  return isPresenceObservationStale(observedAt, now) ? 'stale' : 'current';
}

export function resolveIdentityPhoto(input: {
  readonly kind: string;
  readonly artistAvatarUrl?: string | null;
  readonly connectorImageUrl?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly observedAt?: string | null;
  readonly now?: Date;
}): PresenceIdentityPhoto {
  const now = input.now ?? new Date();
  const observedAt = input.observedAt ?? null;
  const freshness = identityPhotoFreshness(observedAt, now);
  const connectorUrl = pickHttpsUrl(input.connectorImageUrl);
  if (connectorUrl) {
    return {
      url: connectorUrl,
      source: 'connector',
      kind: 'profile',
      observedAt,
      freshness,
      verified: true,
    };
  }

  if (input.kind === 'jovie') {
    const jovieUrl = pickHttpsUrl(input.artistAvatarUrl);
    if (jovieUrl) {
      return {
        url: jovieUrl,
        source: 'jovie',
        kind: 'profile',
        observedAt,
        freshness,
        verified: true,
      };
    }
  }

  const profileUrl = metadataUrl(input.metadata, PROFILE_METADATA_KEYS);
  if (profileUrl) {
    return {
      url: profileUrl,
      source: 'public_metadata',
      kind: 'profile',
      observedAt,
      freshness,
      verified: false,
    };
  }

  const genericUrl = metadataUrl(input.metadata, GENERIC_METADATA_KEYS);
  if (genericUrl) {
    return {
      url: genericUrl,
      source: 'public_metadata',
      kind: 'generic',
      observedAt,
      freshness,
      verified: false,
    };
  }

  return {
    ...MISSING_IDENTITY_PHOTO,
    observedAt,
    freshness: observedAt ? freshness : 'unknown',
  };
}

export function getPresenceIdentityPhoto(
  subject: Pick<PresenceIdentitySubject, 'identityPhoto'>
): PresenceIdentityPhoto {
  return subject.identityPhoto ?? MISSING_IDENTITY_PHOTO;
}

export function getPresenceEntityName(
  subject: Pick<PresenceIdentitySubject, 'kind' | 'platform' | 'label'>,
  artistName: string
): string {
  const label = subject.label.trim();
  const platformName = platformDisplayName(subject.platform);
  const artist = artistName.trim();
  if (subject.kind === 'connector') return label || platformName;
  if (!label) return artist || platformName;
  if (
    artist &&
    (normalizeLabel(label) === normalizeLabel(platformName) ||
      normalizeLabel(label) === normalizeLabel(subject.platform))
  ) {
    return artist;
  }
  return label;
}

export function getPresenceHandle(
  subject: Pick<PresenceIdentitySubject, 'kind' | 'handle' | 'url'>
): string | null {
  const handle = subject.handle?.trim() ?? '';
  if (handle) {
    if (handle.includes(' ') || handle.includes('@') || handle.includes('.')) {
      return handle;
    }
    if (subject.kind === 'social' || subject.kind === 'jovie') {
      return `@${handle.replace(/^@/, '')}`;
    }
    return handle;
  }

  try {
    const url = new URL(subject.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const atSegment = segments.find(segment => segment.startsWith('@'));
    if (atSegment) return decodeURIComponent(atSegment);
    if (segments.length === 1) {
      const value = decodeURIComponent(segments[0] ?? '').replace(/^@/, '');
      if (value) return `@${value}`;
    }
  } catch {
    return handle || null;
  }
  return null;
}

export function getPresencePlatformLabel(
  subject: Pick<PresenceIdentitySubject, 'platform'>
): string {
  return platformDisplayName(subject.platform);
}

export function getPresenceOutcomeGroup(
  subject: Pick<PresenceIdentitySubject, 'kind' | 'rowType'>
): PresenceOutcomeGroup {
  if (subject.rowType === 'connector' || subject.kind === 'connector') {
    return 'connector';
  }
  if (subject.kind === 'jovie' || subject.kind === 'website') return 'identity';
  if (subject.kind === 'dsp' || subject.kind === 'social') return 'profiles';
  if (subject.kind === 'authority') return 'catalog';
  return 'profiles';
}

export function getPresenceObservation(
  subject: Pick<
    PresenceIdentitySubject,
    'monitoringState' | 'rank' | 'lastObservedAt'
  > &
    Partial<Pick<PresenceIdentitySubject, 'kind' | 'rowType'>>,
  options: {
    readonly providerAvailable?: boolean;
    readonly now?: Date;
  } = {}
): {
  readonly status: PresenceObservationStatus;
  readonly label: string;
  readonly detail: string;
} {
  if (subject.rowType === 'connector' || subject.kind === 'connector') {
    if (subject.monitoringState === 'unavailable') {
      return {
        status: 'unavailable',
        label: 'Unavailable',
        detail: 'This source cannot be measured right now.',
      };
    }
    return {
      status: 'measured',
      label: 'Connected',
      detail: 'Account connection status is available.',
    };
  }
  if (subject.monitoringState === 'locked') {
    return {
      status: 'plan-restricted',
      label: 'Plan-Restricted',
      detail: 'Upgrade required to monitor this page.',
    };
  }
  if (
    subject.monitoringState === 'unavailable' ||
    options.providerAvailable === false
  ) {
    return {
      status: 'unavailable',
      label: 'Unavailable',
      detail: 'This source cannot be measured right now.',
    };
  }
  if (isPresenceObservationStale(subject.lastObservedAt, options.now)) {
    return {
      status: 'stale',
      label: 'Stale',
      detail: 'Last check is older than two weeks.',
    };
  }
  if (!subject.lastObservedAt && subject.rank == null) {
    return {
      status: 'pending',
      label: 'Not Measured',
      detail: 'No monitoring run has completed yet.',
    };
  }
  return {
    status: 'measured',
    label: subject.rank === null ? 'Not Ranked' : 'Measured',
    detail:
      subject.rank === null
        ? 'Checked, and this page was not in the measured results.'
        : 'Search rank is available for this page.',
  };
}

export function formatPresenceRank(
  rank: number | null,
  status: PresenceObservationStatus
): string {
  if (status === 'plan-restricted') return 'Restricted';
  if (status === 'unavailable') return 'Unavailable';
  if (status === 'pending') return 'Not Measured';
  if (status === 'stale') return rank === null ? 'Stale' : `#${rank}`;
  if (rank === null) return 'Not Ranked';
  return `#${rank}`;
}

export function identityPhotoAlt(
  entityName: string,
  platformLabel: string,
  photo: PresenceIdentityPhoto
): string {
  if (photo.kind === 'missing' || !photo.url) {
    return `No profile photo for ${entityName} on ${platformLabel}`;
  }
  if (photo.kind === 'generic' || !photo.verified) {
    return `Unverified preview for ${entityName} on ${platformLabel}. Not a verified profile photo.`;
  }
  if (photo.freshness === 'stale') {
    return `Stale profile photo for ${entityName} on ${platformLabel}`;
  }
  return `${entityName} on ${platformLabel}`;
}

export function identityPhotoSourceLabel(photo: PresenceIdentityPhoto): string {
  if (photo.source === 'connector') return 'Authorized connector';
  if (photo.source === 'jovie') return 'Jovie profile';
  if (photo.source === 'public_metadata') {
    return photo.kind === 'generic'
      ? 'Public preview · not a verified avatar'
      : 'Public metadata';
  }
  return 'No photo source';
}

export interface PresenceOutcomeSummary {
  readonly group: Exclude<PresenceOutcomeGroup, 'connector'>;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly attentionCount: number;
  readonly status: PresenceObservationStatus | 'inventory';
}

function presenceSearchDetail(
  searchStatus: 'unavailable' | 'stale' | 'measured' | 'pending'
): string {
  if (searchStatus === 'unavailable') return 'Search provider is unavailable';
  if (searchStatus === 'pending') return 'No search run has completed yet';
  if (searchStatus === 'stale') {
    return 'Last search check is older than two weeks';
  }
  return 'Best measured Jovie rank';
}

export function summarizePresenceOutcomes(input: {
  readonly artistName: string;
  readonly artistIsPublic: boolean;
  readonly providerAvailable: boolean;
  readonly bestJovieRank: number | null;
  readonly lastObservedAt: string | null;
  readonly rows: readonly PresenceIdentitySubject[];
  readonly now?: Date;
}): readonly PresenceOutcomeSummary[] {
  const now = input.now ?? new Date();
  const surfaceRows = input.rows.filter(row => row.kind !== 'connector');
  const byGroup = {
    identity: surfaceRows.filter(
      row => getPresenceOutcomeGroup(row) === 'identity'
    ),
    profiles: surfaceRows.filter(
      row => getPresenceOutcomeGroup(row) === 'profiles'
    ),
    catalog: surfaceRows.filter(
      row => getPresenceOutcomeGroup(row) === 'catalog'
    ),
  } as const;

  let searchStatus: 'unavailable' | 'stale' | 'measured' | 'pending' =
    'pending';
  if (!input.providerAvailable) {
    searchStatus = 'unavailable';
  } else if (isPresenceObservationStale(input.lastObservedAt, now)) {
    searchStatus = 'stale';
  } else if (input.lastObservedAt || input.bestJovieRank !== null) {
    searchStatus = 'measured';
  }

  return [
    ...(['identity', 'profiles', 'catalog'] as const).map(group => ({
      group,
      label: { identity: 'Identity', profiles: 'Profiles', catalog: 'Catalog' }[
        group
      ],
      value: `${byGroup[group].length} ${byGroup[group].length === 1 ? 'Page' : 'Pages'}`,
      detail: {
        identity: 'Artist profile and websites',
        profiles: 'DSP and social pages',
        catalog: 'Authority and directory pages',
      }[group],
      attentionCount: 0,
      status: 'inventory' as const,
    })),
    {
      group: 'search',
      label: 'Search',
      value: formatPresenceRank(input.bestJovieRank, searchStatus),
      detail: presenceSearchDetail(searchStatus),
      attentionCount: searchStatus === 'measured' ? 0 : 1,
      status: searchStatus,
    },
  ];
}

export function isPhotoStripRow(
  subject: Pick<PresenceIdentitySubject, 'kind' | 'rowType'>
): boolean {
  if (subject.rowType === 'connector' || subject.kind === 'connector') {
    return false;
  }
  return (
    subject.kind === 'jovie' ||
    subject.kind === 'website' ||
    subject.kind === 'dsp' ||
    subject.kind === 'social'
  );
}
