import { APP_ROUTES } from '@/constants/routes';
import { YOUTUBE_THUMBNAILS_OPTIMIZATION } from '@/data/youtubeThumbnailsCopy';
import type {
  CertificationEvidenceReceipt,
  CertificationSubject,
} from '@/lib/agent-os/certification';

export const ACQUISITION_STATES = [
  'discovered',
  'inbound_waiting',
  'ingested',
  'qualified',
  'building',
  'machine_review',
  'machine_failed',
  'human_review',
  'certified',
  'rejected',
  'rebuild_waiting',
  'outreach_ready',
  'contacted',
  'claimed',
  'activated',
  'converted',
  'disqualified',
] as const;
export type AcquisitionState = (typeof ACQUISITION_STATES)[number];

const NEXT: Record<AcquisitionState, readonly AcquisitionState[]> = {
  discovered: ['ingested', 'qualified', 'inbound_waiting', 'disqualified'],
  inbound_waiting: ['ingested', 'qualified', 'disqualified', 'rebuild_waiting'],
  ingested: ['qualified', 'building', 'disqualified'],
  qualified: ['building', 'disqualified', 'machine_review'],
  building: ['machine_review', 'machine_failed', 'rebuild_waiting'],
  machine_review: ['human_review', 'machine_failed'],
  machine_failed: ['rebuild_waiting', 'rejected', 'disqualified'],
  human_review: ['certified', 'rejected', 'rebuild_waiting'],
  certified: ['outreach_ready', 'claimed'],
  rejected: ['rebuild_waiting'],
  rebuild_waiting: ['building', 'ingested', 'qualified'],
  outreach_ready: ['contacted', 'human_review'],
  contacted: ['claimed', 'rejected', 'rebuild_waiting'],
  claimed: ['activated'],
  activated: ['converted'],
  converted: ['rebuild_waiting'],
  disqualified: ['rebuild_waiting'],
};

export function canTransitionAcquisitionState(
  from: AcquisitionState,
  to: AcquisitionState
): boolean {
  return from === to || (NEXT[from]?.includes(to) ?? false);
}

export function applyAcquisitionTransition(input: {
  readonly from: AcquisitionState;
  readonly to: AcquisitionState;
}): {
  readonly ok: boolean;
  readonly admittedState: AcquisitionState;
  readonly idempotent: boolean;
} {
  if (input.from === input.to) {
    return { ok: true, admittedState: input.from, idempotent: true };
  }
  const ok = canTransitionAcquisitionState(input.from, input.to);
  return {
    ok,
    admittedState: ok ? input.to : input.from,
    idempotent: false,
  };
}

export const PREMADE_ARTIST_PROFILE_EXPERIMENT_ID =
  'premade-artist-profile' as const;
export const YOUTUBE_GROWTH_EXPERIMENT_ID = 'youtube-growth' as const;
export const ACQUISITION_EXPERIMENT_IDS = [
  PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
  YOUTUBE_GROWTH_EXPERIMENT_ID,
] as const;
export type AcquisitionExperimentId =
  (typeof ACQUISITION_EXPERIMENT_IDS)[number];

export interface AcquisitionExperiment {
  readonly id: AcquisitionExperimentId;
  readonly title: string;
  readonly variantIdentity: string;
  readonly icp: string;
  readonly certificationRubricId: string;
  readonly valueProposition: string;
  readonly outreachDraft: string;
  readonly inboundNotification: string;
  readonly finalDmSend: 'human';
}

export const ACQUISITION_EXPERIMENTS: Record<
  AcquisitionExperimentId,
  AcquisitionExperiment
> = {
  [PREMADE_ARTIST_PROFILE_EXPERIMENT_ID]: {
    id: PREMADE_ARTIST_PROFILE_EXPERIMENT_ID,
    title: 'Premade Artist Profile → Claim',
    variantIdentity: 'launch-acquisition:premade-artist-profile:v1',
    icp: 'Independent artists with public Spotify and a selling bio link.',
    certificationRubricId: 'premade-artist-profile/v1',
    valueProposition: 'A finished public page they can claim in one click.',
    outreachDraft: 'Hey {displayName} — I built you a Jovie page: {claimLink}.',
    inboundNotification: 'A certified page already exists. Continue to claim.',
    finalDmSend: 'human',
  },
  [YOUTUBE_GROWTH_EXPERIMENT_ID]: {
    id: YOUTUBE_GROWTH_EXPERIMENT_ID,
    title: 'YouTube Growth MVP',
    variantIdentity: YOUTUBE_THUMBNAILS_OPTIMIZATION.variantIdentity,
    icp: 'YouTube-native music creators who paste a public channel first.',
    certificationRubricId: 'youtube-growth/v1',
    valueProposition: 'Three real thumbnails redone before signup.',
    outreachDraft:
      'I ran three of your thumbnails through Jovie. Want the redos?',
    inboundNotification: 'Your thumbnail redos are ready.',
    finalDmSend: 'human',
  },
};

export function getAcquisitionExperiment(
  id: AcquisitionExperimentId
): AcquisitionExperiment {
  return ACQUISITION_EXPERIMENTS[id];
}

export function experimentIdForLeadSource(
  _source?: string | null
): AcquisitionExperimentId {
  return PREMADE_ARTIST_PROFILE_EXPERIMENT_ID;
}

export type AcquisitionGapStatus =
  | 'exists_production_ready'
  | 'exists_uncertified'
  | 'in_flight'
  | 'missing'
  | 'obsolete_duplicative';

export interface AcquisitionGapEntry {
  readonly surface: 'shared' | AcquisitionExperimentId;
  readonly stage: string;
  readonly status: AcquisitionGapStatus;
  readonly owner: string;
}

export const ACQUISITION_IMPLEMENTATION_SEQUENCE = [
  'Shared lifecycle, machine-cert auto-ingest gate, review packets, funnel.',
] as const;

export const ACQUISITION_GAP_MAP: readonly AcquisitionGapEntry[] = [
  'shared|identity_resolution|exists_uncertified|lib/leads',
  'shared|candidate_run_state|exists_uncertified|lib/leads + waitlist',
  'shared|discovery|exists_uncertified|lib/leads/discovery.ts',
  'shared|inbound_intake|exists_uncertified|waitlist + /start',
  'shared|ingestion|exists_production_ready|lib/leads/ingest-lead.ts',
  'shared|machine_certification|in_flight|kernel.ts + jovie.certification/v1',
  'shared|human_review|exists_uncertified|admin outreach manual_review',
  'shared|manual_send_queue|exists_production_ready|admin outreach DM',
  'shared|event_tracking|exists_uncertified|lib/leads/funnel-events.ts',
  `${PREMADE_ARTIST_PROFILE_EXPERIMENT_ID}|builder|exists_production_ready|ingest-lead.ts`,
  `${YOUTUBE_GROWTH_EXPERIMENT_ID}|discovery|missing|lib/acquisition`,
  `${YOUTUBE_GROWTH_EXPERIMENT_ID}|builder|exists_uncertified|youtube-thumbnails`,
].map(row => {
  const [surface, stage, status, owner] = row.split('|');
  return {
    surface: surface as AcquisitionGapEntry['surface'],
    stage,
    status: status as AcquisitionGapStatus,
    owner,
  };
});

export function gapStatusCounts(): Record<AcquisitionGapStatus, number> {
  const counts = {
    exists_production_ready: 0,
    exists_uncertified: 0,
    in_flight: 0,
    missing: 0,
    obsolete_duplicative: 0,
  };
  for (const entry of ACQUISITION_GAP_MAP) counts[entry.status] += 1;
  return counts;
}

export interface PremadeProfileEvidence {
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly hasSpotifyLink: boolean;
  readonly contactEmail: string | null;
  readonly instagramHandle: string | null;
  readonly fitScore: number | null;
  readonly hasRepresentation?: boolean;
  readonly bio?: string | null;
}

export interface YouTubeGrowthEvidence {
  readonly channelId: string | null;
  readonly channelTitle: string | null;
  readonly videoCount: number;
  readonly generatedCount: number;
  readonly mode: 'preview_only' | 'before_after';
  readonly altersFaces?: boolean;
}

export interface AcquisitionCriterionResult {
  readonly id: string;
  readonly passed: boolean;
  readonly severity: 'fail' | 'warn';
  readonly summary: string;
}

export interface AcquisitionMachineCertification {
  readonly experimentId: AcquisitionExperimentId;
  readonly rubricId: string;
  readonly passed: boolean;
  readonly confidence: number;
  readonly criteria: readonly AcquisitionCriterionResult[];
  readonly failures: readonly AcquisitionCriterionResult[];
  readonly receipts: readonly CertificationEvidenceReceipt[];
}

function check(
  id: string,
  passed: boolean,
  summary: string,
  severity: 'fail' | 'warn' = 'fail'
): AcquisitionCriterionResult {
  return { id, passed, severity, summary };
}

function finalize(
  experimentId: AcquisitionExperimentId,
  criteria: readonly AcquisitionCriterionResult[]
): AcquisitionMachineCertification {
  const failures = criteria.filter(
    item => !item.passed && item.severity === 'fail'
  );
  const required = criteria.filter(item => item.severity === 'fail');
  const passedCount = required.filter(item => item.passed).length;
  return {
    experimentId,
    rubricId: getAcquisitionExperiment(experimentId).certificationRubricId,
    passed: failures.length === 0,
    confidence: required.length === 0 ? 0 : passedCount / required.length,
    criteria,
    failures,
    receipts: criteria.map(item => ({
      id: item.id,
      tier: 'invariant_evaluation',
      status: item.passed ? 'passed' : 'failed',
      sourceSha: null,
      ref: 'acquisition-machine-certification',
      digest: null,
      summary: item.summary,
    })),
  };
}

export function machineCertifyPremadeProfile(
  evidence: PremadeProfileEvidence
): AcquisitionMachineCertification {
  const named = Boolean(evidence.displayName?.trim());
  const avatar = Boolean(evidence.avatarUrl?.trim());
  const contact = Boolean(
    evidence.contactEmail?.trim() || evidence.instagramHandle?.trim()
  );
  return finalize(PREMADE_ARTIST_PROFILE_EXPERIMENT_ID, [
    check('identity', named, named ? 'Named.' : 'No display name.'),
    check('spotify', evidence.hasSpotifyLink, 'Spotify required.'),
    check('avatar', avatar, avatar ? 'Avatar present.' : 'Missing avatar.'),
    check('contact', contact, contact ? 'Contact present.' : 'No contact.'),
    check('fit', (evidence.fitScore ?? 0) >= 60, 'Fit score needs 60.'),
    check('bio', Boolean(evidence.bio?.trim()), 'Bio optional.', 'warn'),
    check(
      'representation',
      evidence.hasRepresentation !== true,
      'Keep represented acts on human review.',
      'warn'
    ),
  ]);
}

export function machineCertifyYouTubeGrowth(
  evidence: YouTubeGrowthEvidence
): AcquisitionMachineCertification {
  const generated =
    evidence.generatedCount >= 1 && evidence.mode === 'before_after';
  return finalize(YOUTUBE_GROWTH_EXPERIMENT_ID, [
    check('channel', Boolean(evidence.channelId?.trim()), 'Channel required.'),
    check('videos', evidence.videoCount >= 1, 'Need public videos.'),
    check('generated', generated, 'Need at least one redo.'),
    check('faces', evidence.altersFaces !== true, 'No face alteration.'),
  ]);
}

export const ACQUISITION_REVIEW_ACTIONS = [
  'certify',
  'reject',
  'request_rebuild',
  'edit_positioning',
  'open_or_dedupe_issue',
] as const;

export function renderOutreachDraft(
  template: string,
  tokens: { readonly displayName: string | null; readonly claimLink: string }
): string {
  return template
    .replaceAll('{displayName}', tokens.displayName?.trim() || 'there')
    .replaceAll('{claimLink}', tokens.claimLink);
}

export interface AcquisitionReviewPacket {
  readonly contract: 'jovie.acquisition-review/v1';
  readonly experimentId: AcquisitionExperimentId;
  readonly state: AcquisitionState;
  readonly expectedBenefit: string;
  readonly machineCertification: AcquisitionMachineCertification;
  readonly outreachDraft: string;
  readonly productGapIssueKey: string | null;
  readonly actions: typeof ACQUISITION_REVIEW_ACTIONS;
}

export function buildAcquisitionReviewPacket(input: {
  readonly experimentId: AcquisitionExperimentId;
  readonly state: AcquisitionState;
  readonly displayName: string | null;
  readonly claimOrApplyPath: string;
  readonly machineCertification: AcquisitionMachineCertification;
  readonly rejection?: AcquisitionRejection | null;
}): AcquisitionReviewPacket {
  const experiment = getAcquisitionExperiment(input.experimentId);
  return {
    contract: 'jovie.acquisition-review/v1',
    experimentId: input.experimentId,
    state: input.state,
    expectedBenefit: experiment.valueProposition,
    machineCertification: input.machineCertification,
    outreachDraft: renderOutreachDraft(experiment.outreachDraft, {
      displayName: input.displayName,
      claimLink: input.claimOrApplyPath,
    }),
    productGapIssueKey: input.rejection?.productGapIssueKey ?? null,
    actions: ACQUISITION_REVIEW_ACTIONS,
  };
}

export const ACQUISITION_REJECTION_REASONS = [
  'quality_below_bar',
  'wrong_identity',
  'weak_value_proposition',
  'missing_product_capability',
  'broken_product_capability',
  'data_insufficient',
  'icp_mismatch',
  'other',
] as const;
export type AcquisitionRejectionReason =
  (typeof ACQUISITION_REJECTION_REASONS)[number];

export interface AcquisitionRejection {
  readonly candidateId: string;
  readonly experimentId: AcquisitionExperimentId;
  readonly reason: AcquisitionRejectionReason;
  readonly notes: string;
  readonly rebuildEligible: true;
  readonly productGap: boolean;
  readonly productGapIssueKey: string | null;
}

export function captureAcquisitionRejection(input: {
  readonly candidateId: string;
  readonly experimentId: AcquisitionExperimentId;
  readonly reason: AcquisitionRejectionReason;
  readonly notes?: string;
  readonly capability?: string;
}): AcquisitionRejection {
  const notes = input.notes?.trim() || '';
  const productGap =
    input.reason === 'missing_product_capability' ||
    input.reason === 'broken_product_capability';
  const slug =
    (input.capability ?? notes)
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '') || 'unspecified';
  return {
    candidateId: input.candidateId,
    experimentId: input.experimentId,
    reason: input.reason,
    notes,
    rebuildEligible: true,
    productGap,
    productGapIssueKey: productGap
      ? `acquisition-gap:${input.experimentId}:${input.reason}:${slug}`
      : null,
  };
}

export function buildProductGapIssue(rejection: AcquisitionRejection): {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly certificationSubject: CertificationSubject;
} | null {
  if (!rejection.productGap || !rejection.productGapIssueKey) return null;
  const title = `Candidate follow-up: ${rejection.experimentId} gap`;
  const notes = rejection.notes || 'Rejected for a product gap.';
  return {
    key: rejection.productGapIssueKey,
    title,
    body: `## Source\n- Current issue: JOV-5911\n- Candidate: ${rejection.candidateId}\n\n## Follow-up\n${notes}\n\n## Why it matters\nRebuild when the capability lands.\n\n## Classification\nRequired\n\n## Acceptance criteria or triage question\nCapability works; candidate can be rebuilt.\n\n## Dependency\nblockedBy JOV-5911`,
    certificationSubject: {
      id: rejection.productGapIssueKey,
      kind: 'acquisition-product-gap',
      title,
    },
  };
}

export function dedupeProductGapIssue(
  existingKeys: readonly string[],
  issue: { readonly key: string }
): { readonly action: 'create' | 'reuse'; readonly key: string } {
  return {
    action: existingKeys.includes(issue.key) ? 'reuse' : 'create',
    key: issue.key,
  };
}

export const ACQUISITION_FUNNEL_EVENTS = {
  DISCOVERED: 'discovered',
  CONVERTED: 'converted',
} as const;

type FunnelKey = 'discoveredOrInbound' | 'converted';

const EVENT_TO_COUNT: Record<string, FunnelKey> = {
  discovered: 'discoveredOrInbound',
  inbound_waiting: 'discoveredOrInbound',
  converted: 'converted',
  paid_converted: 'converted',
};

export function acquisitionFunnelAttribution(
  experimentId: AcquisitionExperimentId
) {
  return {
    campaignKey: experimentId,
    variantKey: getAcquisitionExperiment(experimentId).variantIdentity,
  };
}

export function segmentAcquisitionFunnel(
  events: readonly {
    readonly experimentId: AcquisitionExperimentId;
    readonly eventType: string;
  }[]
) {
  const empty = { discoveredOrInbound: 0, converted: 0 };
  const byExperiment = {
    [PREMADE_ARTIST_PROFILE_EXPERIMENT_ID]: { ...empty },
    [YOUTUBE_GROWTH_EXPERIMENT_ID]: { ...empty },
  };
  const totals = { ...empty };
  for (const event of events) {
    const key = EVENT_TO_COUNT[event.eventType];
    if (!key) continue;
    totals[key] += 1;
    byExperiment[event.experimentId][key] += 1;
  }
  return { totals, byExperiment };
}

export function isCertifiedForInboundClaim(state: AcquisitionState): boolean {
  return (
    state === 'certified' || state === 'outreach_ready' || state === 'contacted'
  );
}

export function resolveInboundAcquisition(input: {
  readonly experimentId: AcquisitionExperimentId;
  readonly certifiedMatch?: {
    readonly candidateId: string;
    readonly experimentId: AcquisitionExperimentId;
    readonly state: AcquisitionState;
    readonly claimOrApplyPath: string;
  } | null;
  readonly existingRun?: {
    readonly candidateId: string;
    readonly experimentId: AcquisitionExperimentId;
  } | null;
}) {
  const experiment = getAcquisitionExperiment(input.experimentId);
  if (
    input.certifiedMatch &&
    isCertifiedForInboundClaim(input.certifiedMatch.state)
  ) {
    return {
      action: 'claim' as const,
      nextPath: input.certifiedMatch.claimOrApplyPath,
      candidateId: input.certifiedMatch.candidateId,
      notification: experiment.inboundNotification,
    };
  }
  return {
    action: input.existingRun
      ? ('waitlist_and_resume' as const)
      : ('waitlist_and_create' as const),
    nextPath: APP_ROUTES.WAITLIST,
    candidateId: input.existingRun?.candidateId ?? null,
    notification: null,
  };
}

export interface LeadProjectionSource {
  readonly status: string;
  readonly outreachRoute?: string | null;
  readonly outreachStatus?: string | null;
  readonly creatorProfileId?: string | null;
  readonly signupAt?: Date | string | null;
  readonly paidAt?: Date | string | null;
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
  readonly hasSpotifyLink?: boolean | null;
  readonly contactEmail?: string | null;
  readonly instagramHandle?: string | null;
  readonly fitScore?: number | null;
  readonly hasRepresentation?: boolean | null;
  readonly bio?: string | null;
}

export function projectLeadState(lead: LeadProjectionSource): AcquisitionState {
  if (lead.paidAt) return 'converted';
  if (lead.signupAt) return 'activated';
  if (lead.outreachStatus === 'sent' || lead.outreachStatus === 'dm_sent') {
    return 'contacted';
  }
  if (lead.status === 'rejected') return 'rejected';
  if (lead.status === 'disqualified') return 'disqualified';
  if (lead.status === 'ingested' || lead.creatorProfileId) {
    return lead.outreachRoute === 'manual_review' ? 'human_review' : 'ingested';
  }
  if (lead.status === 'approved') return 'building';
  if (lead.status === 'qualified') return 'qualified';
  return 'discovered';
}

export function projectLeadEvidence(
  lead: LeadProjectionSource
): PremadeProfileEvidence {
  return {
    displayName: lead.displayName ?? null,
    avatarUrl: lead.avatarUrl ?? null,
    hasSpotifyLink: Boolean(lead.hasSpotifyLink),
    contactEmail: lead.contactEmail ?? null,
    instagramHandle: lead.instagramHandle ?? null,
    fitScore: lead.fitScore ?? null,
    hasRepresentation: lead.hasRepresentation ?? false,
    bio: lead.bio ?? null,
  };
}

export const LAUNCH_ACQUISITION_VARIANT_ID =
  'launch-acquisition:shared-loop:v1' as const;

export const LAUNCH_ACQUISITION_OPTIMIZATION_CONTRACT = {
  variantIdentity: LAUNCH_ACQUISITION_VARIANT_ID,
  exposure: ACQUISITION_FUNNEL_EVENTS.DISCOVERED,
  outcome: ACQUISITION_FUNNEL_EVENTS.CONVERTED,
  attribution: {
    surfaces: [
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ],
    eventProperties: [
      'variantIdentity',
      'experimentId',
      'campaignKey',
      'contentVariant',
    ],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'content-variant',
  ],
  hypothesis:
    'One shared discover-certify-claim loop converts certified candidates faster than two funnels.',
  primaryMetric:
    'paid_converted / (discovered + inbound_waiting) by experimentId',
  guardrails: [
    'Final DM send remains an explicit human action.',
    'Do not auto-ingest machine-cert failures.',
    'Rejected candidates stay rebuild-eligible.',
    'Do not persist inbound search query text.',
    'Extend leads, waitlist, YouTube preview, and jovie.certification/v1.',
  ],
  privacyAndConsent:
    'Lead cookies, waitlist emails, and anonymous YouTube visitor keys only. No search query text.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback',
  decisionWriteback:
    'Control stays this shared loop. Write back on JOV-5911 and campaignKey.',
  rollbackOrControl:
    'Remove the machine-cert auto-ingest gate and campaignKey stamping.',
} as const;
