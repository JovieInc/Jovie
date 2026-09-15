import 'server-only';

import { createHash } from 'node:crypto';
import {
  type AcquisitionMachineCertification,
  machineCertifyPremadeProfile,
} from '@/lib/acquisition';
import type { Lead, LeadSignalSnapshot } from '@/lib/db/schema/leads';
import {
  calculateFitScore,
  FIT_SCORE_VERSION,
} from '@/lib/fit-scoring/calculator';
import type { QualificationResult } from '@/lib/leads/qualify';
import type { SpotifyLeadEnrichment } from '@/lib/leads/spotify-enrich-lead';

export const PUBLIC_REQUALIFICATION_EVENT_TYPE =
  'public_requalification' as const;
export const PUBLIC_REQUALIFICATION_CONTRACT =
  'jovie.acquisition-candidate-run/v1' as const;
export const PUBLIC_REQUALIFICATION_SCOPE =
  'premade-profile-certification-v1' as const;
export const PUBLIC_REQUALIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Bump when derived public fit inputs change so old receipts stay immutable. */
export const PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION =
  'public-fit-inputs/v2' as const;

/**
 * Public DSP signals mirror the existing fit-scoring service's supported
 * artist identifiers. Linktree links are untrusted input, so only these
 * canonical platform IDs contribute to the distinct-platform count.
 */
const PUBLIC_DSP_PLATFORM_IDS = [
  'spotify',
  'apple_music',
  'soundcloud',
  'deezer',
  'tidal',
  'youtube_music',
] as const;
const PUBLIC_DSP_PLATFORM_SET = new Set(PUBLIC_DSP_PLATFORM_IDS);
type PublicDspPlatformId = (typeof PUBLIC_DSP_PLATFORM_IDS)[number];

export interface PublicDspSignals {
  dspPlatformCount: number;
  hasAppleMusicId: boolean;
  hasSoundCloudId: boolean;
}

export function getPublicDspSignals(
  links: readonly unknown[]
): PublicDspSignals {
  const observed = new Set<string>();
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const platformId = (link as { platformId?: unknown }).platformId;
    if (
      typeof platformId === 'string' &&
      PUBLIC_DSP_PLATFORM_SET.has(platformId as PublicDspPlatformId)
    ) {
      observed.add(platformId);
    }
  }
  return {
    dspPlatformCount: observed.size,
    hasAppleMusicId: observed.has('apple_music'),
    hasSoundCloudId: observed.has('soundcloud'),
  };
}

export function publicRequalificationEventType(sourceRevision: string): string {
  const revision = sourceRevision.startsWith('sha256:')
    ? sourceRevision.slice('sha256:'.length)
    : sourceRevision;
  return `${PUBLIC_REQUALIFICATION_EVENT_TYPE}:${revision}`;
}

export type PublicRequalificationEnvironment = 'dev' | 'preview' | 'production';

type PublicLeadStatus = Lead['status'];

/** The public subset deliberately omits contactEmail and outreach fields. */
export interface PublicLeadRecord {
  id: string;
  linktreeHandle: string;
  linktreeUrl: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  hasPaidTier: boolean | null;
  isLinktreeVerified: boolean | null;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  musicToolsDetected: string[];
  hasTrackingPixels: boolean;
  trackingPixelPlatforms: string[];
  allLinks: unknown;
  signalSnapshot: LeadSignalSnapshot | null;
  fitScore: number | null;
  fitScoreBreakdown: Record<string, unknown> | null;
  status: PublicLeadStatus;
  disqualificationReason: string | null;
  spotifyPopularity: number | null;
  spotifyFollowers: number | null;
  releaseCount: number | null;
  latestReleaseDate: Date | null;
  priorityScore: number | null;
  hasRepresentation: boolean;
}

export interface PublicLeadUpdate {
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  hasPaidTier: boolean | null;
  isLinktreeVerified: boolean | null;
  hasSpotifyLink: boolean;
  spotifyUrl: string | null;
  hasInstagram: boolean;
  instagramHandle: string | null;
  musicToolsDetected: string[];
  hasTrackingPixels: boolean;
  trackingPixelPlatforms: string[];
  allLinks: unknown[];
  signalSnapshot: LeadSignalSnapshot;
  fitScore: number;
  fitScoreBreakdown: Record<string, unknown>;
  spotifyPopularity: number | null;
  spotifyFollowers: number | null;
  releaseCount: number | null;
  latestReleaseDate: Date | null;
  priorityScore: number | null;
  scrapedAt: Date;
  updatedAt: Date;
  status?: 'qualified' | 'disqualified';
  disqualificationReason?: string | null;
  qualifiedAt?: Date | null;
  disqualifiedAt?: Date | null;
}

export interface PublicCandidateObservation {
  candidateKey: string;
  profileUrl: string;
  sourcePlatform: 'linktree';
  qualification: {
    status: QualificationResult['status'];
    disqualificationReason: string | null;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    hasPaidTier: boolean | null;
    isLinktreeVerified: boolean | null;
    hasSpotifyLink: boolean;
    spotifyUrl: string | null;
    hasInstagram: boolean;
    instagramHandle: string | null;
    musicToolsDetected: string[];
    hasTrackingPixels: boolean;
    trackingPixelPlatforms: string[];
    allLinks: unknown[];
  };
  spotify: {
    status: SpotifyLeadEnrichment['status'];
    reason: string | null;
    artistId: string | null;
    popularity: number | null;
    followers: number | null;
    genres: string[];
    releaseCount: number | null;
    latestReleaseDate: string | null;
    priorityScore: number | null;
  };
}

export interface PublicCandidateRun {
  contract: typeof PUBLIC_REQUALIFICATION_CONTRACT;
  candidateId: string;
  candidateKey: string;
  runId: string;
  dedupeKey: string;
  attemptEventType: string;
  previousAttemptRunId: string | null;
  requestedScope: typeof PUBLIC_REQUALIFICATION_SCOPE;
  fitInputVersion?: string;
  environment: 'dev';
  observedAt: string;
  expiresAt: string;
  sourceRevision: string;
  sourceDigest: string;
  decisionDigest: string;
  sourceUrls: string[];
  state: 'machine_failed' | 'human_review';
  publicObservation: PublicCandidateObservation;
  fitScore: number;
  fitScoreBreakdown: Record<string, unknown>;
  machineCertification: AcquisitionMachineCertification;
}

export interface PublicRequalificationResult {
  candidateId: string;
  candidateKey: string;
  runId: string;
  dedupeKey: string;
  attemptEventType: string;
  previousAttemptRunId: string | null;
  fitInputVersion: string | null;
  sourceRevision: string;
  sourceDigest: string;
  decisionDigest: string;
  environment: 'dev';
  observedAt: string;
  expiresAt: string;
  fitScore: number;
  fitScoreBreakdown: Record<string, unknown>;
  machineCertification: AcquisitionMachineCertification;
  state: PublicCandidateRun['state'];
  deduplicated: boolean;
  publicObservation: PublicCandidateObservation;
}

export class PublicRequalificationConflictError extends Error {
  readonly candidateId: string;
  readonly existingSourceRevision: string | null;
  readonly incomingSourceRevision: string;

  constructor(input: {
    candidateId: string;
    existingSourceRevision: string | null;
    incomingSourceRevision: string;
  }) {
    super(
      `Public requalification receipt already exists for candidate ${input.candidateId} with a different source revision`
    );
    this.name = 'PublicRequalificationConflictError';
    this.candidateId = input.candidateId;
    this.existingSourceRevision = input.existingSourceRevision;
    this.incomingSourceRevision = input.incomingSourceRevision;
  }
}
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`;
}

export function sortLinks(links: readonly unknown[]): unknown[] {
  return [...links].sort((left, right) =>
    stableSerialize(left).localeCompare(stableSerialize(right))
  );
}

function stableDecisionBreakdown(
  breakdown: Record<string, unknown>
): Record<string, unknown> {
  const meta = breakdown.meta;
  if (!meta || typeof meta !== 'object') return breakdown;
  const { calculatedAt: _calculatedAt, ...stableMeta } = meta as Record<
    string,
    unknown
  >;
  return { ...breakdown, meta: stableMeta };
}
function publicQualification(
  qualification: QualificationResult
): PublicCandidateObservation['qualification'] {
  return {
    status: qualification.status,
    disqualificationReason: qualification.disqualificationReason,
    displayName: qualification.displayName,
    bio: qualification.bio,
    avatarUrl: qualification.avatarUrl,
    hasPaidTier: qualification.hasPaidTier,
    isLinktreeVerified: qualification.isLinktreeVerified,
    hasSpotifyLink: qualification.hasSpotifyLink,
    spotifyUrl: qualification.spotifyUrl,
    hasInstagram: qualification.hasInstagram,
    instagramHandle: qualification.instagramHandle,
    // Public source digests use ECMAScript code-unit ordering. localeCompare
    // would make the immutable receipt identity depend on the host locale.
    musicToolsDetected: [...qualification.musicToolsDetected].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    hasTrackingPixels: qualification.hasTrackingPixels,
    trackingPixelPlatforms: [...qualification.trackingPixelPlatforms].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    allLinks: sortLinks(qualification.allLinks),
  };
}

function publicSpotify(
  enrichment: SpotifyLeadEnrichment
): PublicCandidateObservation['spotify'] {
  return {
    status: enrichment.status,
    reason: enrichment.reason ?? null,
    artistId: enrichment.artistId,
    popularity: enrichment.spotifyPopularity,
    followers: enrichment.spotifyFollowers,
    genres: [...enrichment.spotifyGenres].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    releaseCount: enrichment.releaseCount,
    latestReleaseDate: enrichment.latestReleaseDate?.toISOString() ?? null,
    priorityScore: enrichment.priorityScore,
  };
}

function buildSourceObservation(input: {
  candidateKey: string;
  profileUrl: string;
  qualification: QualificationResult;
  spotify: SpotifyLeadEnrichment;
}): PublicCandidateObservation {
  return {
    candidateKey: input.candidateKey,
    profileUrl: input.profileUrl,
    sourcePlatform: 'linktree',
    qualification: publicQualification(input.qualification),
    spotify: publicSpotify(input.spotify),
  };
}

export function buildPublicRun(input: {
  candidateId: string;
  candidateKey: string;
  profileUrl: string;
  qualification: QualificationResult;
  spotify: SpotifyLeadEnrichment;
  existingRepresentation: boolean;
  observedAt: Date;
  previousAttemptRunId: string | null;
}): PublicCandidateRun {
  const publicObservation = buildSourceObservation(input);
  const dspSignals = getPublicDspSignals(input.qualification.allLinks);
  const sourceDigest = sha256({
    source: 'linktree',
    observed: publicObservation.qualification,
  });
  const sourceRevision = sha256({
    contract: PUBLIC_REQUALIFICATION_CONTRACT,
    fitInputVersion: PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
    fitScoreVersion: FIT_SCORE_VERSION,
    requestedScope: PUBLIC_REQUALIFICATION_SCOPE,
    candidateKey: input.candidateKey,
    publicObservation,
    sourceDigest,
  });
  const runId = `${PUBLIC_REQUALIFICATION_SCOPE}:${input.candidateId}:${sourceRevision.slice(7)}`;
  const dedupeKey = `${PUBLIC_REQUALIFICATION_SCOPE}:${input.candidateKey}:${sourceRevision}`;
  const attemptEventType = publicRequalificationEventType(sourceRevision);
  const fitResult = calculateFitScore({
    ingestionSourcePlatform: 'linktree',
    hasPaidTier: input.qualification.hasPaidTier ?? undefined,
    socialLinkPlatforms: input.qualification.allLinks
      .map(link => link.platformId)
      .filter((platform): platform is string => Boolean(platform)),
    hasSpotifyId: input.qualification.hasSpotifyLink,
    spotifyPopularity: input.spotify.spotifyPopularity,
    genres: input.spotify.spotifyGenres,
    latestReleaseDate: input.spotify.latestReleaseDate,
    hasContactEmail: false,
    hasAppleMusicId: dspSignals.hasAppleMusicId,
    hasSoundCloudId: dspSignals.hasSoundCloudId,
    dspPlatformCount: dspSignals.dspPlatformCount,
    hasTrackingPixels: input.qualification.hasTrackingPixels,
  });
  const evidence = machineCertifyPremadeProfile({
    displayName: input.qualification.displayName,
    avatarUrl: input.qualification.avatarUrl,
    hasSpotifyLink: input.qualification.hasSpotifyLink,
    contactEmail: null,
    instagramHandle: input.qualification.instagramHandle,
    fitScore: fitResult.score,
    hasRepresentation: input.existingRepresentation,
    bio: input.qualification.bio,
  });
  const decisionDigest = sha256({
    sourceRevision,
    fitScore: fitResult.score,
    fitScoreBreakdown: stableDecisionBreakdown(
      fitResult.breakdown as unknown as Record<string, unknown>
    ),
    machineCertification: {
      experimentId: evidence.experimentId,
      rubricId: evidence.rubricId,
      passed: evidence.passed,
      confidence: evidence.confidence,
      criteria: evidence.criteria,
      failures: evidence.failures,
    },
  });
  const fitScoreBreakdown = {
    ...fitResult.breakdown,
    meta: {
      ...fitResult.breakdown.meta,
      source: 'public-requalification',
      observedAt: input.observedAt.toISOString(),
      sourceDigest,
      sourceRevision,
      runId,
      fitScoreVersion: FIT_SCORE_VERSION,
      fitInputVersion: PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
    },
  };
  const machineCertification: AcquisitionMachineCertification = {
    ...evidence,
    receipts: evidence.receipts.map(receipt => ({
      ...receipt,
      sourceSha: sourceDigest,
      ref: input.profileUrl,
      digest: decisionDigest,
    })),
  };
  const expiresAt = new Date(
    input.observedAt.getTime() + PUBLIC_REQUALIFICATION_TTL_MS
  );
  const sourceUrls = [
    input.profileUrl,
    ...input.qualification.allLinks.map(link => link.url),
  ]
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .sort((left, right) => left.localeCompare(right));

  return {
    contract: PUBLIC_REQUALIFICATION_CONTRACT,
    candidateId: input.candidateId,
    candidateKey: input.candidateKey,
    runId,
    dedupeKey,
    attemptEventType,
    previousAttemptRunId: input.previousAttemptRunId,
    requestedScope: PUBLIC_REQUALIFICATION_SCOPE,
    fitInputVersion: PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
    environment: 'dev',
    observedAt: input.observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sourceRevision,
    sourceDigest,
    decisionDigest,
    sourceUrls,
    state: machineCertification.passed ? 'human_review' : 'machine_failed',
    publicObservation,
    fitScore: fitResult.score,
    fitScoreBreakdown,
    machineCertification,
  };
}

export function resultFromRun(run: PublicCandidateRun, deduplicated: boolean) {
  return {
    candidateId: run.candidateId,
    candidateKey: run.candidateKey,
    runId: run.runId,
    dedupeKey: run.dedupeKey,
    sourceRevision: run.sourceRevision,
    sourceDigest: run.sourceDigest,
    decisionDigest: run.decisionDigest,
    attemptEventType: run.attemptEventType,
    previousAttemptRunId: run.previousAttemptRunId,
    fitInputVersion: run.fitInputVersion ?? null,
    environment: run.environment,
    observedAt: run.observedAt,
    expiresAt: run.expiresAt,
    fitScore: run.fitScore,
    fitScoreBreakdown: run.fitScoreBreakdown,
    machineCertification: run.machineCertification,
    state: run.state,
    deduplicated,
    publicObservation: run.publicObservation,
  } satisfies PublicRequalificationResult;
}
export function runFromMetadata(
  metadata: Record<string, unknown>
): PublicCandidateRun | null {
  if (
    metadata.contract !== PUBLIC_REQUALIFICATION_CONTRACT ||
    typeof metadata.candidateId !== 'string' ||
    typeof metadata.candidateKey !== 'string' ||
    typeof metadata.runId !== 'string' ||
    typeof metadata.dedupeKey !== 'string' ||
    typeof metadata.sourceRevision !== 'string' ||
    typeof metadata.sourceDigest !== 'string' ||
    typeof metadata.decisionDigest !== 'string' ||
    typeof metadata.observedAt !== 'string' ||
    typeof metadata.expiresAt !== 'string' ||
    typeof metadata.fitScore !== 'number' ||
    !metadata.publicObservation ||
    typeof metadata.publicObservation !== 'object' ||
    !metadata.machineCertification ||
    typeof metadata.machineCertification !== 'object'
  ) {
    return null;
  }
  const sourceRevision = metadata.sourceRevision;
  return {
    ...metadata,
    attemptEventType:
      typeof metadata.attemptEventType === 'string'
        ? metadata.attemptEventType
        : publicRequalificationEventType(sourceRevision),
    previousAttemptRunId:
      typeof metadata.previousAttemptRunId === 'string'
        ? metadata.previousAttemptRunId
        : null,
  } as unknown as PublicCandidateRun;
}
