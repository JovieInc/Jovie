/** Shared JOV-5911 kernel. Experiments configure this; do not fork pipelines. */

export const ACQUISITION_CONTRACT = 'jovie.acquisition/v1' as const;

export const LAUNCH_EXPERIMENT_IDS = [
  'premade-artist-profile',
  'youtube-closed-loop',
] as const;

export type LaunchExperimentId = (typeof LAUNCH_EXPERIMENT_IDS)[number];

export const ACQUISITION_RUN_STATES = [
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

export type AcquisitionRunState = (typeof ACQUISITION_RUN_STATES)[number];

export const ACQUISITION_GAP_STATUSES = [
  'production_ready',
  'exists_uncertified',
  'in_flight',
  'missing',
  'obsolete_duplicate',
] as const;

export type AcquisitionGapStatus = (typeof ACQUISITION_GAP_STATUSES)[number];

export const ACQUISITION_AUDIT_STAGES = [
  'discovery_qualification',
  'identity_resolution',
  'data_ingestion',
  'experience_build',
  'machine_certification',
  'ovi_human_review',
  'rejection_rebuild',
  'outreach_manual_send',
  'claim_activation',
  'conversion_receipts',
  'inbound_waitlist',
] as const;

export type AcquisitionAuditStage = (typeof ACQUISITION_AUDIT_STAGES)[number];

export const ACQUISITION_OPTIMIZATION_SURFACES = [
  'analytics',
  'model-experiments',
  'audience-events',
  'youtube-experiments',
  'release-to-revenue',
] as const;

export const ACQUISITION_CONTEXT_DIMENSIONS = [
  'platform',
  'medium-or-channel',
  'country-or-locale',
  'content-variant',
] as const;

export interface AcquisitionOptimizationContract {
  readonly variantIdentity: string;
  readonly exposure: string;
  readonly outcome: string;
  readonly attribution: {
    readonly surfaces: readonly (typeof ACQUISITION_OPTIMIZATION_SURFACES)[number][];
    readonly eventProperties: readonly string[];
  };
  readonly eligibleContextDimensions: readonly (typeof ACQUISITION_CONTEXT_DIMENSIONS)[number][];
  readonly hypothesis: string;
  readonly primaryMetric: string;
  readonly guardrails: readonly string[];
  readonly privacyAndConsent: string;
  readonly optimizerOwner: string;
  readonly cadence: string;
  readonly decisionWriteback: string;
  readonly rollbackOrControl: string;
}

export interface AcquisitionAttribution {
  readonly experimentId: LaunchExperimentId;
  readonly variantIdentity: string;
  readonly campaignKey: LaunchExperimentId;
  readonly source: string;
}

export function acquisitionAttribution(
  experimentId: LaunchExperimentId,
  variantIdentity: string,
  source: string
): AcquisitionAttribution {
  return {
    experimentId,
    variantIdentity,
    campaignKey: experimentId,
    source,
  };
}

export function evaluateAcquisitionDmSend(): {
  readonly allowed: false;
  readonly reason: 'tim-only-final-send';
} {
  return { allowed: false, reason: 'tim-only-final-send' };
}

export function evaluateYoutubeRetargetingAds(): {
  readonly allowed: false;
  readonly reason: 'ads-after-youtube-dogfood';
} {
  return { allowed: false, reason: 'ads-after-youtube-dogfood' };
}
