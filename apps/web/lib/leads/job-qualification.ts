import { createHash } from 'node:crypto';
import {
  getAcquisitionExperiment,
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
  YOUTUBE_GROWTH_EXPERIMENT_ID,
} from '@/lib/acquisition/kernel';
import type { CertificationState } from '@/lib/agent-os/certification';

export const JOB_QUALIFICATION_CONTRACT = 'jovie.job-qualification/v1' as const;
export const QUALIFICATION_POLICY_VERSION =
  'job-qualification-policy/2026-10-21' as const;
/** Historical interface values only; never payment probabilities or ranking inputs. */
export const LEGACY_CUSTOMER_RANKING_WEIGHTS = {
  demonstrated: 1,
  cadence: 0.5,
  stated: 0.25,
} as const;
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

export interface CommercialScope {
  readonly buyerId: string;
  readonly representedEntityId: string;
  readonly supportedJobId: SupportedJobDefinition['id'];
  readonly capabilityVersion: string;
  readonly offerId: string;
  readonly offerVersion: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly cadence: 'one_time' | 'month' | 'year';
}

export type CommercialClaim =
  | { readonly dimension: 'budget'; readonly availableMinor: number }
  | { readonly dimension: 'authority'; readonly authorized: boolean }
  | { readonly dimension: 'commitment'; readonly accepted: boolean }
  | { readonly dimension: 'urgency'; readonly deadline: string };

/** Uses canonical observations; public tool facts cannot supply these claims. */
export interface CommercialEvidence
  extends MaterialObservation<CommercialClaim> {
  readonly scope: CommercialScope;
  readonly basis: 'observed' | 'reported' | 'inferred';
  readonly confidenceBasis: string;
  readonly coverage:
    | 'observed'
    | 'not_found_in_coverage'
    | 'inaccessible'
    | 'not_researched';
}

export interface CommercialContext {
  readonly scope: CommercialScope;
  readonly evidence: readonly CommercialEvidence[];
  /** Explicit supported needs, never inferred from wealth, badges or tool links. */
  readonly needs: readonly {
    readonly featureId: string;
    readonly mustSell: boolean;
  }[];
  /** Projection of existing product subjects; no new capability registry. */
  readonly capabilities: readonly {
    readonly featureId: string;
    readonly capabilityVersion: string;
    readonly state: CertificationState;
  }[];
  /** Amounts use the offer currency. null means unknown, never zero. */
  readonly costs: {
    readonly acquisitionMinor: number | null;
    readonly researchMinor: number | null;
    readonly actionMinor: number | null;
    readonly deliveryMinor: number | null;
    readonly supportMinor: number | null;
  };
  readonly researchBudgetRemainingMinor: number | null;
  readonly reservedActionBudgetMinor: number | null;
}

export interface CustomerRanking {
  /** Deprecated compatibility slot; no calibrated payment estimate exists. */
  readonly payScore: null;
  readonly fitScore: number | null;
  /** Ordinal decision band, not a probability or weighted score. */
  readonly rank: 1 | 2 | null;
  readonly band: 'ready_now' | 'ready' | 'research' | 'held' | 'blocked';
  readonly heldFor: readonly string[];
  readonly reasons: readonly string[];
  readonly unknowns: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly costs: CommercialContext['costs'] | null;
  readonly researchBudgetRemainingMinor: number | null;
  readonly reservedActionBudgetMinor: number | null;
  readonly nextAction:
    | 'hold'
    | 'resolve_buyer'
    | 'request_evidence'
    | 'request_outbound_approval';
  readonly whyNow: string;
  readonly unresolvedQuestion: string | null;
  readonly requiredApprovals: readonly ['tim_outbound_approval'];
}

export interface SupportedJobDefinition {
  readonly id: 'premade-artist-profile' | 'youtube-thumbnail-preview';
  readonly requiresSpotifyArtist: boolean;
  readonly requiresAudienceMinimum: boolean;
  readonly requiredRoles: readonly CandidateRole[];
  readonly offerId: string;
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
    offerId: premadeOffer.id,
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
    offerId: youtubeOffer.id,
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
  /** Missing on legacy/public-only paths; absence keeps commercial readiness unknown. */
  readonly commercial?: CommercialContext;
}

export interface QualificationDecision {
  readonly state: DecisionState;
  readonly reasons: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface CommercialQualificationDecision extends QualificationDecision {
  readonly abilityAtPrice: TriState;
  readonly purchaseAuthority: TriState;
  readonly offerCommitment: TriState;
  readonly excludedEvidenceIds: readonly string[];
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
  readonly commercialDecision: CommercialQualificationDecision;
  /** Retains original evidence, including excluded claims, for versioned replay. */
  readonly commercialContext: CommercialContext | null;
  readonly contactDecisions: readonly ChannelEligibility[];
  readonly overallDecision: QualificationDecision;
  readonly spotifyArtistId: string | null;
  readonly deterministicKey: string;
  readonly decisionSnapshotKey: string;
  readonly explorationSampleEligible: boolean;
  readonly ranking: CustomerRanking;
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

function sortedRecords<T>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    stableSerialize(left).localeCompare(stableSerialize(right))
  );
}

function decisionSnapshotKey(input: JobQualificationInput): string {
  return digest({
    ...input,
    policyVersion: QUALIFICATION_POLICY_VERSION,
    supportedJob: SUPPORTED_JOB_REGISTRY[input.supportedJobId],
    identity: {
      ...input.identity,
      roles: [...input.identity.roles].sort(),
      sourceAliases: [...input.identity.sourceAliases].sort(),
      representsIdentityIds: [...input.identity.representsIdentityIds].sort(),
    },
    observations: sortedRecords(input.observations),
    tools: sortedRecords(
      input.tools.map(tool => ({
        ...tool,
        evidenceIds: [...tool.evidenceIds].sort(),
      }))
    ),
    spotifyUrls: [...input.spotifyUrls].sort(),
    duplicateOf: [...input.duplicateOf].sort(),
    channelEligibility: sortedRecords(
      input.channelEligibility.map(channel => ({
        ...channel,
        permissionEvidenceIds: [...channel.permissionEvidenceIds].sort(),
        reasons: [...channel.reasons].sort(),
      }))
    ),
    commercial: input.commercial
      ? {
          ...input.commercial,
          evidence: sortedRecords(input.commercial.evidence),
          needs: sortedRecords(input.commercial.needs),
          capabilities: sortedRecords(input.commercial.capabilities),
        }
      : null,
  });
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
        !Number.isFinite(now) ||
        !Number.isFinite(new Date(item.provenance.capturedAt).getTime()) ||
        new Date(item.provenance.capturedAt).getTime() > now ||
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
  const representedBuyer =
    input.identity.representsIdentityIds.length > 0 &&
    input.identity.roles.some(role =>
      ['manager', 'label', 'representative'].includes(role)
    );
  if (
    !representedBuyer &&
    !input.identity.roles.some(role => job.requiredRoles.includes(role))
  ) {
    reasons.push('role_not_supported');
  }
  if (!input.activeGoal) reasons.push('active_goal_unknown');
  if (!input.observedOpportunity) reasons.push('opportunity_unknown');
  if (input.observations.length === 0)
    reasons.push('material_evidence_missing');
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

function decideCommercial(
  input: JobQualificationInput
): CommercialQualificationDecision {
  const context = input.commercial;
  if (!context)
    return {
      state: 'review_needed',
      reasons: ['offer_context_missing'],
      evidenceIds: [],
      excludedEvidenceIds: [],
      abilityAtPrice: 'unknown',
      purchaseAuthority: 'unknown',
      offerCommitment: 'unknown',
    };
  const job = SUPPORTED_JOB_REGISTRY[input.supportedJobId];
  const scope = context.scope;
  const now = Date.parse(input.now);
  const scopeValid =
    scope.buyerId === input.identity.personId &&
    (scope.representedEntityId === input.identity.personId ||
      input.identity.representsIdentityIds.includes(
        scope.representedEntityId
      )) &&
    scope.supportedJobId === job.id &&
    scope.capabilityVersion === job.capabilityVersion &&
    scope.offerVersion === job.offerVersion &&
    scope.offerId === job.offerId &&
    Number.isSafeInteger(scope.priceMinor) &&
    scope.priceMinor >= 0 &&
    /^[A-Z]{3}$/.test(scope.currency);
  const evidence = context.evidence.filter(
    item =>
      scopeValid &&
      stableSerialize(item.scope) === stableSerialize(scope) &&
      item.basis !== 'inferred' &&
      item.coverage === 'observed' &&
      item.confidenceBasis.trim().length > 0 &&
      item.provenance.sourceUrl.trim().length > 0 &&
      item.provenance.supportingField.trim().length > 0 &&
      item.provenance.extractionVersion.trim().length > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(item.provenance.sourceDigest) &&
      Number.isFinite(Date.parse(item.provenance.capturedAt)) &&
      Date.parse(item.provenance.capturedAt) <= now &&
      now - Date.parse(item.provenance.capturedAt) <= input.evidenceMaxAgeMs &&
      item.uncertainty.length === 0 &&
      item.contradictions.length === 0 &&
      (item.observedFact.dimension !== 'budget' ||
        (Number.isSafeInteger(item.observedFact.availableMinor) &&
          item.observedFact.availableMinor >= 0))
  );
  const dimension = (
    name: CommercialClaim['dimension'],
    positive: (claim: CommercialClaim) => boolean
  ): TriState => {
    const claims = evidence.filter(
      item => item.observedFact.dimension === name
    );
    if (claims.length === 0) return 'unknown';
    const positives = claims.filter(item => positive(item.observedFact)).length;
    if (positives > 0 && positives < claims.length) return 'unknown';
    return positives === claims.length ? 'yes' : 'no';
  };
  const budget = dimension(
    'budget',
    claim =>
      claim.dimension === 'budget' &&
      Number.isSafeInteger(claim.availableMinor) &&
      claim.availableMinor >= scope.priceMinor
  );
  const authority = dimension(
    'authority',
    claim => claim.dimension === 'authority' && claim.authorized
  );
  const commitment = dimension(
    'commitment',
    claim => claim.dimension === 'commitment' && claim.accepted
  );
  const reasons: string[] = [];
  if (!scopeValid) reasons.push('commercial_scope_mismatch');
  for (const [name, value] of Object.entries({
    budget,
    authority,
    commitment,
  })) {
    if (value !== 'yes')
      reasons.push(`${name}_${value === 'no' ? 'negative' : 'unknown'}`);
  }
  if (evidence.length !== context.evidence.length)
    reasons.push('commercial_evidence_excluded');
  const windowValid =
    Number.isFinite(now) &&
    now >= Date.parse(input.timeWindow.startsAt) &&
    now <= Date.parse(input.timeWindow.endsAt);
  if (!windowValid) reasons.push('decision_window_inactive');
  return {
    state: reasons.length === 0 ? 'pass' : 'review_needed',
    reasons,
    evidenceIds: evidence.map(item => item.id).sort(),
    excludedEvidenceIds: context.evidence
      .filter(item => !evidence.includes(item))
      .map(item => item.id)
      .sort(),
    abilityAtPrice: budget,
    purchaseAuthority: authority,
    offerCommitment: commitment,
  };
}

/** Deterministic incumbent: hard gates stay separate from ordinal prioritization. */
function rankQualifiedCustomer(
  input: JobQualificationInput,
  overall: QualificationDecision,
  commercial: CommercialQualificationDecision
): CustomerRanking {
  const context = input.commercial;
  const monitored = (featureId: string) => {
    const subjects =
      context?.capabilities.filter(item => item.featureId === featureId) ?? [];
    return (
      subjects.length > 0 &&
      subjects.every(
        item =>
          item.state === 'monitored' &&
          item.capabilityVersion === context?.scope.capabilityVersion
      )
    );
  };
  const heldFor = [
    ...new Set(
      context?.needs
        .filter(need => need.mustSell && !monitored(need.featureId))
        .map(need => need.featureId) ?? []
    ),
  ].sort();
  const unknowns = overall.reasons.filter(reason =>
    /unknown|missing|ambiguous|stale|contradiction|excluded|mismatch/.test(
      reason
    )
  );
  if (!context?.needs.length) unknowns.push('needs_unknown');
  const fitScore = context?.needs.length
    ? context.needs.filter(need => monitored(need.featureId)).length /
      context.needs.length
    : null;
  if (fitScore === 0) unknowns.push('no_supported_need');
  const validMoney = (value: number | null | undefined): value is number =>
    value != null && Number.isSafeInteger(value) && value >= 0;
  if (
    !context ||
    Object.values(context.costs).some(value => !validMoney(value))
  )
    unknowns.push('cost_unknown');
  const needsResearch = overall.state !== 'pass' || unknowns.length > 0;
  if (!validMoney(context?.reservedActionBudgetMinor))
    unknowns.push('action_budget_unknown');
  if (needsResearch && !validMoney(context?.researchBudgetRemainingMinor))
    unknowns.push('research_budget_unknown');
  const budgetExhausted =
    context &&
    ((validMoney(context.reservedActionBudgetMinor) &&
      validMoney(context.costs.actionMinor) &&
      context.reservedActionBudgetMinor < context.costs.actionMinor) ||
      (needsResearch && context.researchBudgetRemainingMinor === 0));
  const ready =
    overall.state === 'pass' &&
    unknowns.length === 0 &&
    heldFor.length === 0 &&
    !budgetExhausted;
  const urgent =
    context?.evidence.some(
      item =>
        commercial.evidenceIds.includes(item.id) &&
        item.observedFact.dimension === 'urgency' &&
        Date.parse(item.observedFact.deadline) > Date.parse(input.now) &&
        Date.parse(item.observedFact.deadline) <=
          Date.parse(input.timeWindow.endsAt)
    ) ?? false;
  const blocked =
    overall.state === 'fail' ||
    input.identity.identityDecision !== 'pass' ||
    overall.reasons.includes('no_contact_eligible_channel') ||
    commercial.abilityAtPrice === 'no' ||
    commercial.offerCommitment === 'no';
  const band =
    heldFor.length > 0
      ? 'held'
      : blocked
        ? 'blocked'
        : ready
          ? urgent
            ? 'ready_now'
            : 'ready'
          : 'research';
  const represented =
    input.identity.representsIdentityIds.length > 0 ||
    commercial.purchaseAuthority === 'no';
  return {
    payScore: null,
    fitScore,
    rank: ready ? (urgent ? 2 : 1) : null,
    band,
    heldFor,
    reasons: [
      ...new Set([
        ...overall.reasons,
        ...(ready
          ? [
              urgent
                ? 'bound_offer_commitment_with_deadline'
                : 'bound_offer_commitment',
            ]
          : []),
        ...heldFor.map(id => `capability_not_monitored:${id}`),
        ...(budgetExhausted ? ['budget_exhausted'] : []),
        ...unknowns,
      ]),
    ],
    unknowns,
    evidenceIds: [
      ...new Set([...overall.evidenceIds, ...commercial.evidenceIds]),
    ].sort(),
    costs: context?.costs ?? null,
    researchBudgetRemainingMinor: context?.researchBudgetRemainingMinor ?? null,
    reservedActionBudgetMinor: context?.reservedActionBudgetMinor ?? null,
    nextAction:
      heldFor.length > 0 || blocked || budgetExhausted
        ? 'hold'
        : represented
          ? 'resolve_buyer'
          : ready
            ? 'request_outbound_approval'
            : 'request_evidence',
    whyNow: ready
      ? urgent
        ? 'bound_offer_commitment_with_deadline'
        : 'bound_offer_commitment'
      : 'resolve_decision_changing_uncertainty',
    unresolvedQuestion: heldFor[0]
      ? `When will ${heldFor[0]} be monitored?`
      : (unknowns[0] ?? null),
    requiredApprovals: ['tim_outbound_approval'],
  };
}

/** Always use canonical qualification rather than accepting caller-supplied gate decisions. */
export function rankCustomer(input: JobQualificationInput): CustomerRanking {
  return qualifySupportedJob(input).ranking;
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
    channel =>
      channel.decision === 'pass' &&
      channel.permissionEvidenceIds.length > 0 &&
      channel.permissionEvidenceIds.every(id =>
        input.observations.some(item => item.id === id)
      )
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

  let overallDecision: QualificationDecision = {
    state: overallState,
    reasons,
    evidenceIds: [
      ...new Set([
        ...evidenceDecision.evidenceIds,
        ...commercialDecision.evidenceIds,
      ]),
    ].sort(),
  };
  const ranking = rankQualifiedCustomer(
    input,
    overallDecision,
    commercialDecision
  );
  if (overallDecision.state === 'pass' && ranking.rank === null) {
    overallDecision = {
      ...overallDecision,
      state: 'review_needed',
      reasons: ranking.reasons,
    };
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
    commercialContext: input.commercial ?? null,
    contactDecisions: input.channelEligibility,
    overallDecision,
    ranking,
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
    decisionSnapshotKey: decisionSnapshotKey(input),
    explorationSampleEligible: overallDecision.state !== 'pass',
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
