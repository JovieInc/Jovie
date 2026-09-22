import 'server-only';

import { and, desc, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type LeadSignalSnapshot,
  leadFunnelEvents,
  leads,
} from '@/lib/db/schema/leads';
import { env } from '@/lib/env-server';
import {
  extractLinktreeHandle,
  validateLinktreeUrl,
} from '@/lib/ingestion/strategies/linktree';
import { recordLeadFunnelEvent } from '@/lib/leads/funnel-events';
import {
  buildPublicRun,
  PUBLIC_REQUALIFICATION_CONTRACT,
  PUBLIC_REQUALIFICATION_EVENT_TYPE,
  PUBLIC_REQUALIFICATION_SCOPE,
  type PublicCandidateRun,
  type PublicLeadRecord,
  type PublicLeadUpdate,
  PublicRequalificationConflictError,
  type PublicRequalificationEnvironment,
  type PublicRequalificationResult,
  resultFromRun,
  runFromMetadata,
  sortLinks,
} from '@/lib/leads/public-requalification-contract';
import { type QualificationResult, qualifyLead } from '@/lib/leads/qualify';
import {
  type SpotifyLeadEnrichment,
  spotifyEnrichLead,
} from '@/lib/leads/spotify-enrich-lead';

export {
  getPublicDspSignals,
  PUBLIC_REQUALIFICATION_CONTRACT,
  PUBLIC_REQUALIFICATION_EVENT_TYPE,
  PUBLIC_REQUALIFICATION_FIT_INPUT_VERSION,
  PUBLIC_REQUALIFICATION_SCOPE,
  PUBLIC_REQUALIFICATION_TTL_MS,
  type PublicCandidateObservation,
  type PublicCandidateRun,
  type PublicDspSignals,
  type PublicLeadRecord,
  type PublicLeadUpdate,
  PublicRequalificationConflictError,
  type PublicRequalificationEnvironment,
  type PublicRequalificationResult,
  publicRequalificationEventType,
} from '@/lib/leads/public-requalification-contract';

export interface PublicRequalificationDependencies {
  now?: () => Date;
  getLeadByHandle?: (handle: string) => Promise<PublicLeadRecord | null>;
  createLead?: (input: {
    handle: string;
    url: string;
  }) => Promise<PublicLeadRecord>;
  updateLead?: (leadId: string, update: PublicLeadUpdate) => Promise<void>;
  getRunReceipt?: (
    leadId: string,
    eventType: string
  ) => Promise<Record<string, unknown> | null>;
  getLatestRunReceipt?: (
    leadId: string
  ) => Promise<Record<string, unknown> | null>;
  persistRunReceipt?: (input: {
    leadId: string;
    run: PublicCandidateRun;
    eventType: string;
  }) => Promise<boolean>;
  qualify?: typeof qualifyLead;
  spotifyEnrich?: (
    leadId: string,
    options: { persist: false; spotifyUrl: string | null }
  ) => Promise<SpotifyLeadEnrichment>;
  environment?: PublicRequalificationEnvironment;
}
function environmentFromRuntime(): PublicRequalificationEnvironment {
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return 'production';
  }
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'dev';
}

function assertDevEnvironment(environment: PublicRequalificationEnvironment) {
  if (environment !== 'dev') {
    throw new Error(
      `Public requalification is dev-only; refusing to run in ${environment}`
    );
  }
}
function buildLeadUpdate(input: {
  qualification: QualificationResult;
  spotify: SpotifyLeadEnrichment;
  run: PublicCandidateRun;
  lead: PublicLeadRecord;
}): PublicLeadUpdate {
  const snapshot: LeadSignalSnapshot = {
    verified: input.qualification.isLinktreeVerified,
    hasPaidTier: input.qualification.hasPaidTier,
    hasSpotifyLink: input.qualification.hasSpotifyLink,
    hasInstagram: input.qualification.hasInstagram,
    // Public receipt digests use ECMAScript code-unit ordering. localeCompare
    // would make the immutable receipt identity depend on the host locale.
    musicToolsDetected: [...input.qualification.musicToolsDetected].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    allLinks: sortLinks(input.qualification.allLinks),
    hasTrackingPixels: input.qualification.hasTrackingPixels,
    trackingPixelPlatforms: [
      ...input.qualification.trackingPixelPlatforms,
    ].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    discoveryQuery: null,
    sourcePlatform: 'linktree',
    publicObservedAt: input.run.observedAt,
    publicSourceDigest: input.run.sourceDigest,
    publicSourceRevision: input.run.sourceRevision,
    spotifyGenres: [...input.spotify.spotifyGenres].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    spotifyEnrichmentStatus: input.spotify.status,
  };
  const update: PublicLeadUpdate = {
    displayName: input.qualification.displayName,
    bio: input.qualification.bio,
    avatarUrl: input.qualification.avatarUrl,
    hasPaidTier: input.qualification.hasPaidTier,
    isLinktreeVerified: input.qualification.isLinktreeVerified,
    hasSpotifyLink: input.qualification.hasSpotifyLink,
    spotifyUrl: input.qualification.spotifyUrl,
    hasInstagram: input.qualification.hasInstagram,
    instagramHandle: input.qualification.instagramHandle,
    musicToolsDetected: [...input.qualification.musicToolsDetected].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    hasTrackingPixels: input.qualification.hasTrackingPixels,
    trackingPixelPlatforms: [
      ...input.qualification.trackingPixelPlatforms,
    ].sort(), // NOSONAR (typescript:S2871) - Canonical digest order is locale-independent ECMAScript code-unit order.
    allLinks: [...input.qualification.allLinks],
    signalSnapshot: snapshot,
    fitScore: input.run.fitScore,
    fitScoreBreakdown: input.run.fitScoreBreakdown,
    spotifyPopularity: input.spotify.spotifyPopularity,
    spotifyFollowers: input.spotify.spotifyFollowers,
    releaseCount: input.spotify.releaseCount,
    latestReleaseDate: input.spotify.latestReleaseDate,
    priorityScore: input.spotify.priorityScore,
    scrapedAt: new Date(input.run.observedAt),
    updatedAt: new Date(input.run.observedAt),
  };

  if (
    input.lead.status === 'discovered' ||
    input.lead.status === 'qualified' ||
    input.lead.status === 'disqualified'
  ) {
    update.status = input.qualification.status;
    update.disqualificationReason = input.qualification.disqualificationReason;
    update.qualifiedAt =
      input.qualification.status === 'qualified'
        ? new Date(input.run.observedAt)
        : null;
    update.disqualifiedAt =
      input.qualification.status === 'disqualified'
        ? new Date(input.run.observedAt)
        : null;
  }

  return update;
}

const publicLeadSelection = {
  id: leads.id,
  linktreeHandle: leads.linktreeHandle,
  linktreeUrl: leads.linktreeUrl,
  displayName: leads.displayName,
  bio: leads.bio,
  avatarUrl: leads.avatarUrl,
  hasPaidTier: leads.hasPaidTier,
  isLinktreeVerified: leads.isLinktreeVerified,
  hasSpotifyLink: leads.hasSpotifyLink,
  spotifyUrl: leads.spotifyUrl,
  hasInstagram: leads.hasInstagram,
  instagramHandle: leads.instagramHandle,
  musicToolsDetected: leads.musicToolsDetected,
  hasTrackingPixels: leads.hasTrackingPixels,
  trackingPixelPlatforms: leads.trackingPixelPlatforms,
  allLinks: leads.allLinks,
  signalSnapshot: leads.signalSnapshot,
  fitScore: leads.fitScore,
  fitScoreBreakdown: leads.fitScoreBreakdown,
  status: leads.status,
  disqualificationReason: leads.disqualificationReason,
  spotifyPopularity: leads.spotifyPopularity,
  spotifyFollowers: leads.spotifyFollowers,
  releaseCount: leads.releaseCount,
  latestReleaseDate: leads.latestReleaseDate,
  priorityScore: leads.priorityScore,
  hasRepresentation: leads.hasRepresentation,
} as const;

async function defaultGetLeadByHandle(
  handle: string
): Promise<PublicLeadRecord | null> {
  const [lead] = await db
    .select(publicLeadSelection)
    .from(leads)
    .where(eq(leads.linktreeHandle, handle))
    .limit(1);
  if (!lead) return null;
  return {
    ...lead,
    fitScoreBreakdown: lead.fitScoreBreakdown as Record<string, unknown> | null,
  };
}

async function defaultCreateLead(input: {
  handle: string;
  url: string;
}): Promise<PublicLeadRecord> {
  await db
    .insert(leads)
    .values({
      linktreeHandle: input.handle,
      linktreeUrl: input.url,
      discoverySource: 'manual',
      sourcePlatform: 'linktree',
      sourceHandle: input.handle,
      sourceUrl: input.url,
      musicToolsDetected: [],
    })
    .onConflictDoNothing({ target: leads.linktreeHandle });

  const lead = await defaultGetLeadByHandle(input.handle);
  if (!lead) {
    throw new Error('Public requalification could not persist the lead seed');
  }
  return lead;
}

async function defaultUpdateLead(
  leadId: string,
  update: PublicLeadUpdate
): Promise<void> {
  await db.update(leads).set(update).where(eq(leads.id, leadId));
}

async function defaultGetRunReceipt(
  leadId: string,
  eventType: string
): Promise<Record<string, unknown> | null> {
  const [event] = await db
    .select({ metadata: leadFunnelEvents.metadata })
    .from(leadFunnelEvents)
    .where(
      and(
        eq(leadFunnelEvents.leadId, leadId),
        eq(leadFunnelEvents.eventType, eventType)
      )
    )
    .orderBy(desc(leadFunnelEvents.occurredAt))
    .limit(1);
  return event?.metadata ?? null;
}

async function defaultGetLatestRunReceipt(
  leadId: string
): Promise<Record<string, unknown> | null> {
  const [event] = await db
    .select({ metadata: leadFunnelEvents.metadata })
    .from(leadFunnelEvents)
    .where(
      and(
        eq(leadFunnelEvents.leadId, leadId),
        like(
          leadFunnelEvents.eventType,
          `${PUBLIC_REQUALIFICATION_EVENT_TYPE}%`
        )
      )
    )
    .orderBy(desc(leadFunnelEvents.occurredAt))
    .limit(1);
  return event?.metadata ?? null;
}

async function defaultPersistRunReceipt(input: {
  leadId: string;
  run: PublicCandidateRun;
  eventType: string;
}): Promise<boolean> {
  await recordLeadFunnelEvent(
    {
      leadId: input.leadId,
      eventType: input.eventType,
      channel: 'public',
      provider: 'linktree+spotify',
      campaignKey: PUBLIC_REQUALIFICATION_SCOPE,
      variantKey: PUBLIC_REQUALIFICATION_CONTRACT,
      metadata: { ...input.run },
      occurredAt: new Date(input.run.observedAt),
    },
    { idempotent: true, required: true }
  );
  return true;
}

/**
 * Refresh one Linktree candidate using public source data only.
 *
 * The run is intentionally dev-only and stops before ingestion, claim-token
 * generation, outreach, or Ovi suggested-action creation. Each source
 * revision gets its own immutable funnel event type, while retries of the
 * same revision resolve to the original receipt.
 */
export async function requalifyPublicLead(
  input: { linktreeUrl: string },
  dependencies: PublicRequalificationDependencies = {}
): Promise<PublicRequalificationResult> {
  const environment = dependencies.environment ?? environmentFromRuntime();
  assertDevEnvironment(environment);

  const profileUrl = validateLinktreeUrl(input.linktreeUrl);
  const candidateKey = profileUrl ? extractLinktreeHandle(profileUrl) : null;
  if (!profileUrl || !candidateKey) {
    throw new Error('Public requalification requires a valid Linktree URL');
  }

  const getLeadByHandle =
    dependencies.getLeadByHandle ?? defaultGetLeadByHandle;
  const createLead = dependencies.createLead ?? defaultCreateLead;
  const updateLead = dependencies.updateLead ?? defaultUpdateLead;
  const getRunReceipt = dependencies.getRunReceipt ?? defaultGetRunReceipt;
  const getLatestRunReceipt =
    dependencies.getLatestRunReceipt ?? defaultGetLatestRunReceipt;
  const persistRunReceipt =
    dependencies.persistRunReceipt ?? defaultPersistRunReceipt;
  const qualify = dependencies.qualify ?? qualifyLead;
  const spotifyEnrich =
    dependencies.spotifyEnrich ??
    ((leadId: string, options: { persist: false; spotifyUrl: string | null }) =>
      spotifyEnrichLead(leadId, options));
  const now = dependencies.now ?? (() => new Date());

  let lead = await getLeadByHandle(candidateKey);
  if (!lead) {
    lead = await createLead({ handle: candidateKey, url: profileUrl });
  }

  const qualification = await qualify(profileUrl, {
    includePrivateContact: false,
  });
  const spotify = await spotifyEnrich(lead.id, {
    persist: false,
    spotifyUrl: qualification.spotifyUrl,
  });
  const observedAt = now();
  const previousMetadata = await getLatestRunReceipt(lead.id);
  const previousRun = previousMetadata
    ? runFromMetadata(previousMetadata)
    : null;
  const run = buildPublicRun({
    candidateId: lead.id,
    candidateKey,
    profileUrl,
    qualification,
    spotify,
    existingRepresentation: lead.hasRepresentation,
    observedAt,
    previousAttemptRunId: previousRun?.runId ?? null,
  });
  if (previousMetadata && !previousRun) {
    throw new PublicRequalificationConflictError({
      candidateId: lead.id,
      existingSourceRevision: null,
      incomingSourceRevision: run.sourceRevision,
    });
  }

  const existingMetadata = await getRunReceipt(lead.id, run.attemptEventType);
  if (existingMetadata) {
    const existingRun = runFromMetadata(existingMetadata);
    if (!existingRun) {
      throw new PublicRequalificationConflictError({
        candidateId: lead.id,
        existingSourceRevision: null,
        incomingSourceRevision: run.sourceRevision,
      });
    }
    if (
      existingRun.attemptEventType !== run.attemptEventType ||
      existingRun.candidateId !== run.candidateId ||
      existingRun.candidateKey !== run.candidateKey ||
      existingRun.dedupeKey !== run.dedupeKey ||
      existingRun.environment !== run.environment ||
      existingRun.sourceRevision !== run.sourceRevision ||
      existingRun.sourceDigest !== run.sourceDigest ||
      existingRun.decisionDigest !== run.decisionDigest
    ) {
      throw new PublicRequalificationConflictError({
        candidateId: lead.id,
        existingSourceRevision: existingRun.sourceRevision,
        incomingSourceRevision: run.sourceRevision,
      });
    }
    return resultFromRun(existingRun, true);
  }

  await updateLead(
    lead.id,
    buildLeadUpdate({ qualification, spotify, run, lead })
  );
  const inserted = await persistRunReceipt({
    leadId: lead.id,
    run,
    eventType: run.attemptEventType,
  });

  const persistedMetadata = await getRunReceipt(lead.id, run.attemptEventType);
  const persistedRun = persistedMetadata
    ? runFromMetadata(persistedMetadata)
    : null;
  if (!persistedRun || persistedRun.sourceRevision !== run.sourceRevision) {
    throw new Error(
      'Public requalification run was not durably persisted with its source revision'
    );
  }

  return resultFromRun(persistedRun, !inserted);
}
