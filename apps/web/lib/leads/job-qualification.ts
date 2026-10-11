import { createHash } from 'node:crypto';
import {
  getAcquisitionExperiment,
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
  YOUTUBE_GROWTH_EXPERIMENT_ID,
} from '@/lib/acquisition/kernel';

export const JOB_QUALIFICATION_CONTRACT = 'jovie.job-qualification/v1' as const;
export const QUALIFICATION_POLICY_VERSION =
  'job-qualification-policy/2026-09-27' as const;
export const PUBLIC_EVIDENCE_EXTRACTION_VERSION =
  'public-evidence-extraction/v1' as const;

export const PUBLIC_SIGNAL_POLICY_REGISTRY = {
  linktree: {
    version: 'linktree-public-signals/2026-09-27',
    primarySources: [
      'https://linktr.ee/help/en/articles/5434140-an-overview-of-paid-features-available-on-linktree',
      'https://linktr.ee/help/en/articles/5434083-upgrade-plans-and-payment-options',
    ],
    rules: {
      brandingPresent: 'presentation_only',
      brandingAbsent: 'paid_access_unknown',
      identityBadge: 'identity_only',
      toolLink: 'usage_only',
      trialOrBundle: 'paid_access_unknown',
    },
  },
} as const;

export type TriState = 'yes' | 'no' | 'unknown';
export type DecisionState = 'pass' | 'fail' | 'review_needed';
export type CandidateRole =
  | 'artist'
  | 'creator'
  | 'manager'
  | 'label'
  | 'representative'
  | 'unknown';

export interface EvidenceProvenance {
  readonly sourceUrl: string;
  readonly sourceId: string | null;
  readonly capturedAt: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly immutableRef: string | null;
  readonly extractionVersion: string;
  readonly supportingField: string;
  readonly supportingExcerpt: string | null;
}

export interface MaterialObservation<T = unknown> {
  readonly id: string;
  readonly kind: string;
  readonly observedFact: T;
  readonly provenance: EvidenceProvenance;
  readonly confidence: number;
  readonly uncertainty: readonly string[];
  readonly contradictions: readonly string[];
}

export interface RepresentedIdentity {
  readonly personId: string;
  readonly displayName: string | null;
  readonly roles: readonly CandidateRole[];
  readonly representsIdentityIds: readonly string[];
  readonly sourceAliases: readonly string[];
  readonly identityConfidence: number;
  readonly identityDecision: DecisionState;
}

export interface ToolCommercialFacts {
  readonly toolId: string;
  readonly usageObserved: TriState;
  readonly paidAccess: TriState;
  readonly exactPlan: string | null;
  readonly exactSpend: number | null;
  readonly purchaseControl: TriState;
  readonly replaceability: TriState;
  readonly buyIntent: TriState;
  readonly accessBasis: 'direct_purchase' | 'trial' | 'bundle' | 'unknown';
  readonly evidenceIds: readonly string[];
}

export interface ChannelEligibility {
  readonly channel: string;
  readonly decision: DecisionState;
  readonly permissionEvidenceIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface SupportedJobDefinition {
  readonly id: 'premade-artist-profile' | 'youtube-thumbnail-preview';
  readonly requiresSpotifyArtist: boolean;
  readonly requiresAudienceMinimum: boolean;
  readonly requiredRoles: readonly CandidateRole[];
  readonly offerVersion: string;
  readonly capabilityVersion: string;
  readonly maturity: 'production_ready' | 'limited_access';
  readonly deliverable: string;
}

const premadeOffer = getAcquisitionExperiment(
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID
);
const youtubeOffer = getAcquisitionExperiment(YOUTUBE_GROWTH_EXPERIMENT_ID);

/** Canonical projection of existing acquisition offer/capability exports. */
export const SUPPORTED_JOB_REGISTRY: Readonly<
  Record<SupportedJobDefinition['id'], SupportedJobDefinition>
> = {
  'premade-artist-profile': {
    id: 'premade-artist-profile',
    requiresSpotifyArtist: true,
    requiresAudienceMinimum: false,
    requiredRoles: ['artist'],
    offerVersion: premadeOffer.variantIdentity,
    capabilityVersion: premadeOffer.certificationRubricId,
    maturity: 'production_ready',
    deliverable: premadeOffer.valueProposition,
  },
  'youtube-thumbnail-preview': {
    id: 'youtube-thumbnail-preview',
    requiresSpotifyArtist: false,
    requiresAudienceMinimum: false,
    requiredRoles: ['creator', 'artist'],
    offerVersion: youtubeOffer.variantIdentity,
    capabilityVersion: youtubeOffer.certificationRubricId,
    maturity: 'limited_access',
    deliverable: youtubeOffer.valueProposition,
  },
};

export interface JobQualificationInput {
  readonly candidateRunId: string;
  readonly identity: RepresentedIdentity;
  readonly activeGoal: string | null;
  readonly supportedJobId: SupportedJobDefinition['id'];
  readonly observedOpportunity: string | null;
  readonly source: string;
  readonly timeWindow: { readonly startsAt: string; readonly endsAt: string };
  readonly observations: readonly MaterialObservation[];
  readonly tools: readonly ToolCommercialFacts[];
  readonly spotifyUrls: readonly string[];
  readonly channelEligibility: readonly ChannelEligibility[];
  readonly duplicateOf: readonly string[];
  readonly existingCustomer: boolean;
  readonly existingClaim: boolean;
  readonly priorOutreach: boolean;
  readonly now: string;
  readonly evidenceMaxAgeMs: number;
}

export interface QualificationDecision {
  readonly state: DecisionState;
  readonly reasons: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface JobQualificationResult {
  readonly contract: typeof JOB_QUALIFICATION_CONTRACT;
  readonly policyVersion: typeof QUALIFICATION_POLICY_VERSION;
  readonly candidateRunId: string;
  readonly identity: RepresentedIdentity;
  readonly activeGoal: string | null;
  readonly supportedJob: SupportedJobDefinition;
  readonly observedOpportunity: string | null;
  readonly source: string;
  readonly timeWindow: JobQualificationInput['timeWindow'];
  readonly observations: readonly MaterialObservation[];
  readonly tools: readonly ToolCommercialFacts[];
  readonly evidenceDecision: QualificationDecision;
  readonly commercialDecision: QualificationDecision;
  readonly contactDecisions: readonly ChannelEligibility[];
  readonly overallDecision: QualificationDecision;
  readonly spotifyArtistId: string | null;
  readonly deterministicKey: string;
  readonly explorationSampleEligible: boolean;
}

export interface DecisionComparison {
  readonly incumbent: {
    readonly decision: 'qualified' | 'disqualified';
    readonly reason: string | null;
  };
  readonly current: QualificationDecision;
  readonly changed: boolean;
  readonly compatibilityPolicy: 'preserve_incumbent_record_requalify';
}

export function compareQualificationDecisions(input: {
  readonly incumbentDecision: 'qualified' | 'disqualified';
  readonly incumbentReason: string | null;
  readonly current: QualificationDecision;
}): DecisionComparison {
  const equivalent =
    (input.incumbentDecision === 'qualified' &&
      input.current.state === 'pass') ||
    (input.incumbentDecision === 'disqualified' &&
      input.current.state === 'fail');
  return {
    incumbent: {
      decision: input.incumbentDecision,
      reason: input.incumbentReason,
    },
    current: input.current,
    changed: !equivalent,
    compatibilityPolicy: 'preserve_incumbent_record_requalify',
  };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex')}`;
}

export function parseSpotifyArtistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'open.spotify.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'artist') return null;
    return /^[A-Za-z0-9]+$/.test(parts[1] ?? '') ? (parts[1] ?? null) : null;
  } catch {
    return null;
  }
}

function staleEvidenceIds(input: JobQualificationInput): string[] {
  const now = new Date(input.now).getTime();
  return input.observations
    .filter(
      item =>
        !Number.isFinite(new Date(item.provenance.capturedAt).getTime()) ||
        now - new Date(item.provenance.capturedAt).getTime() >
          input.evidenceMaxAgeMs
    )
    .map(item => item.id);
}

function decideEvidence(
  input: JobQualificationInput,
  job: SupportedJobDefinition,
  artistIds: readonly string[]
): QualificationDecision {
  const reasons: string[] = [];
  if (input.identity.identityDecision !== 'pass') {
    reasons.push('identity_ambiguous');
  }
  if (!input.identity.roles.some(role => job.requiredRoles.includes(role))) {
    reasons.push('role_not_supported');
  }
  if (!input.activeGoal) reasons.push('active_goal_unknown');
  if (!input.observedOpportunity) reasons.push('opportunity_unknown');
  if (staleEvidenceIds(input).length > 0) reasons.push('stale_evidence');
  if (input.observations.some(item => item.contradictions.length > 0)) {
    reasons.push('evidence_contradiction');
  }
  if (job.requiresSpotifyArtist && artistIds.length !== 1) {
    reasons.push(
      artistIds.length === 0
        ? 'spotify_artist_required'
        : 'spotify_identity_ambiguous'
    );
  }
  let state: DecisionState = 'pass';
  if (reasons.includes('role_not_supported')) {
    state = 'fail';
  } else if (reasons.length > 0) {
    state = 'review_needed';
  }
  return {
    state,
    reasons,
    evidenceIds: input.observations.map(item => item.id),
  };
}

function decideCommercial(input: JobQualificationInput): QualificationDecision {
  const evidenceIds = input.tools.flatMap(tool => tool.evidenceIds);
  const hasBuyIntent = input.tools.some(tool => tool.buyIntent === 'yes');
  const hasPurchaseControl = input.tools.some(
    tool => tool.purchaseControl === 'yes'
  );
  const reasons: string[] = [];
  if (!hasBuyIntent) reasons.push('buy_intent_unknown');
  if (!hasPurchaseControl) reasons.push('purchase_control_unknown');
  return {
    state: hasBuyIntent && hasPurchaseControl ? 'pass' : 'review_needed',
    reasons,
    evidenceIds,
  };
}

export function qualifySupportedJob(
  input: JobQualificationInput
): JobQualificationResult {
  const job = SUPPORTED_JOB_REGISTRY[input.supportedJobId];
  const artistIds = [
    ...new Set(input.spotifyUrls.map(parseSpotifyArtistId).filter(Boolean)),
  ] as string[];
  const evidenceDecision = decideEvidence(input, job, artistIds);
  const commercialDecision = decideCommercial(input);
  const duplicate =
    input.duplicateOf.length > 0 ||
    input.existingCustomer ||
    input.existingClaim ||
    input.priorOutreach;
  const contactPass = input.channelEligibility.some(
    channel => channel.decision === 'pass'
  );
  const reasons = [
    ...evidenceDecision.reasons,
    ...commercialDecision.reasons,
    ...(duplicate ? ['duplicate_or_existing_relationship'] : []),
    ...(contactPass ? [] : ['no_contact_eligible_channel']),
    ...(input.identity.representsIdentityIds.length > 0
      ? ['represented_identity_human_path']
      : []),
  ];
  const hardFail = duplicate || evidenceDecision.state === 'fail';
  let overallState: DecisionState = 'pass';
  if (hardFail) {
    overallState = 'fail';
  } else if (reasons.length > 0) {
    overallState = 'review_needed';
  }

  return {
    contract: JOB_QUALIFICATION_CONTRACT,
    policyVersion: QUALIFICATION_POLICY_VERSION,
    candidateRunId: input.candidateRunId,
    identity: input.identity,
    activeGoal: input.activeGoal,
    supportedJob: job,
    observedOpportunity: input.observedOpportunity,
    source: input.source,
    timeWindow: input.timeWindow,
    observations: input.observations,
    tools: input.tools,
    evidenceDecision,
    commercialDecision,
    contactDecisions: input.channelEligibility,
    overallDecision: {
      state: overallState,
      reasons,
      evidenceIds: evidenceDecision.evidenceIds,
    },
    spotifyArtistId: artistIds.length === 1 ? (artistIds[0] ?? null) : null,
    deterministicKey: digest({
      personId: input.identity.personId,
      roles: [...input.identity.roles].sort((left, right) =>
        left.localeCompare(right)
      ),
      supportedJobId: input.supportedJobId,
      sourceAliases: [...input.identity.sourceAliases].sort((left, right) =>
        left.localeCompare(right)
      ),
      sourceDigests: input.observations
        .map(item => item.provenance.sourceDigest)
        .sort((left, right) => left.localeCompare(right)),
    }),
    explorationSampleEligible: overallState !== 'pass',
  };
}

/**
 * Existing booleans remain readable but are never upgraded from public-page
 * heuristics. `true` needs approved first-party billing evidence; otherwise the
 * migration projects `unknown` and routes the record through review/replay.
 */
export function migrateLegacyPaidTier(input: {
  readonly legacyValue: boolean | null;
  readonly hasApprovedBillingEvidence: boolean;
}): TriState {
  if (input.legacyValue === false) return 'no';
  if (input.legacyValue === true && input.hasApprovedBillingEvidence)
    return 'yes';
  return 'unknown';
}

export type ToolRelationship =
  | 'replacement'
  | 'complement'
  | 'dependency'
  | 'unknown';

export function classifyToolRelationship(input: {
  readonly capabilitySupportsReplacement: boolean;
  readonly capabilitySupportsComplement: boolean;
  readonly requiredForDelivery: boolean;
}): ToolRelationship {
  if (input.requiredForDelivery) return 'dependency';
  if (input.capabilitySupportsReplacement) return 'replacement';
  if (input.capabilitySupportsComplement) return 'complement';
  return 'unknown';
}
