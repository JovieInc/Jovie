import {
  canonicalizeSurfaceUrl,
  type ProfileQualificationStatus,
  type ProfileSurfaceKind,
} from './contracts';

const DSP_PLATFORMS = new Set([
  'amazon_music',
  'apple_music',
  'bandcamp',
  'deezer',
  'soundcloud',
  'spotify',
  'tidal',
  'youtube_music',
]);

const AUTHORITY_PLATFORMS = new Set([
  'genius',
  'musicbrainz',
  'musixmatch',
  'wikipedia',
]);

export interface SurfaceSourceCandidate {
  readonly sourceType: string;
  readonly sourceRefId: string;
  readonly sourceUrl: string;
  readonly externalId: string | null;
}

export interface SurfaceCandidate {
  readonly kind: ProfileSurfaceKind;
  readonly platform: string;
  readonly displayName: string | null;
  readonly handle: string | null;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly externalId: string | null;
  readonly qualificationStatus: ProfileQualificationStatus;
  readonly identityConfidence: string;
  readonly isOfficial: boolean;
  readonly monitoringPriority: number;
  readonly sources: readonly SurfaceSourceCandidate[];
}

interface CandidateInput {
  readonly profile: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string | null;
  };
  readonly publicProfileBaseUrl: string;
  readonly socials: ReadonlyArray<{
    readonly id: string;
    readonly platform: string;
    readonly platformType: string | null;
    readonly displayText: string | null;
    readonly url: string;
    readonly confidence: string;
    readonly sortOrder: number | null;
  }>;
  readonly dspMatches: ReadonlyArray<{
    readonly id: string;
    readonly providerId: string;
    readonly externalArtistName: string | null;
    readonly externalArtistUrl: string | null;
    readonly externalArtistId: string | null;
    readonly confidenceScore: string | null;
  }>;
  readonly identityLinks: ReadonlyArray<{
    readonly id: string;
    readonly platform: string;
    readonly url: string;
    readonly externalId: string | null;
  }>;
}

function classifyKind(
  platform: string,
  platformType?: string | null
): ProfileSurfaceKind {
  if (platformType === 'website' || platform === 'website') return 'website';
  if (DSP_PLATFORMS.has(platform)) return 'dsp';
  if (AUTHORITY_PLATFORMS.has(platform)) return 'authority';
  return 'social';
}

function addCandidate(
  map: Map<string, SurfaceCandidate>,
  candidate: Omit<SurfaceCandidate, 'normalizedUrl'>
) {
  const canonical = canonicalizeSurfaceUrl(candidate.url);
  if (!canonical) return;

  const existing = map.get(canonical.url);
  if (!existing) {
    map.set(canonical.url, { ...candidate, normalizedUrl: canonical.url });
    return;
  }

  const preferCandidate =
    existing.qualificationStatus !== 'qualified' &&
    candidate.qualificationStatus === 'qualified';
  map.set(canonical.url, {
    ...(preferCandidate ? candidate : existing),
    normalizedUrl: canonical.url,
    sources: [...existing.sources, ...candidate.sources],
  });
}

export function buildSurfaceCandidates(input: CandidateInput) {
  const candidates = new Map<string, SurfaceCandidate>();
  const publicProfileUrl = new URL(
    `/${encodeURIComponent(input.profile.username)}`,
    input.publicProfileBaseUrl
  ).toString();

  addCandidate(candidates, {
    kind: 'jovie',
    platform: 'jovie',
    displayName: input.profile.displayName,
    handle: input.profile.username,
    url: publicProfileUrl,
    externalId: input.profile.id,
    qualificationStatus: 'qualified',
    identityConfidence: '1.00',
    isOfficial: true,
    monitoringPriority: -1,
    sources: [
      {
        sourceType: 'creator_profile',
        sourceRefId: input.profile.id,
        sourceUrl: publicProfileUrl,
        externalId: input.profile.id,
      },
    ],
  });

  for (const row of input.socials) {
    addCandidate(candidates, {
      kind: classifyKind(row.platform, row.platformType),
      platform: row.platform,
      displayName: row.displayText,
      handle: row.displayText,
      url: row.url,
      externalId: null,
      qualificationStatus: 'qualified',
      identityConfidence: row.confidence,
      isOfficial: true,
      monitoringPriority: row.sortOrder ?? 0,
      sources: [
        {
          sourceType: 'social_link',
          sourceRefId: row.id,
          sourceUrl: row.url,
          externalId: null,
        },
      ],
    });
  }

  for (const row of input.dspMatches) {
    if (!row.externalArtistUrl) continue;
    addCandidate(candidates, {
      kind: 'dsp',
      platform: row.providerId,
      displayName: row.externalArtistName,
      handle: null,
      url: row.externalArtistUrl,
      externalId: row.externalArtistId,
      qualificationStatus: 'qualified',
      identityConfidence: row.confidenceScore ?? '0.95',
      isOfficial: true,
      monitoringPriority: 0,
      sources: [
        {
          sourceType: 'dsp_match',
          sourceRefId: row.id,
          sourceUrl: row.externalArtistUrl,
          externalId: row.externalArtistId,
        },
      ],
    });
  }

  for (const row of input.identityLinks) {
    addCandidate(candidates, {
      kind: classifyKind(row.platform),
      platform: row.platform,
      displayName: null,
      handle: null,
      url: row.url,
      externalId: row.externalId,
      qualificationStatus: 'suggested',
      identityConfidence: '0.70',
      isOfficial: false,
      monitoringPriority: 0,
      sources: [
        {
          sourceType: 'identity_link',
          sourceRefId: row.id,
          sourceUrl: row.url,
          externalId: row.externalId,
        },
      ],
    });
  }

  return [...candidates.values()];
}
