/** JOV-5911 current-state/gap audit. Experiment 2 is JOV-5881. */

import {
  ACQUISITION_AUDIT_STAGES,
  type AcquisitionAuditStage,
  type AcquisitionGapStatus,
  type LaunchExperimentId,
} from './contract';

export interface AcquisitionGapRow {
  readonly stage: AcquisitionAuditStage;
  readonly status: AcquisitionGapStatus;
  readonly owner: string;
  readonly evidence: string;
}

export interface AcquisitionNextPath {
  readonly issue: string;
  readonly stage: AcquisitionAuditStage;
  readonly reason: string;
}

type CompactGap = readonly [AcquisitionGapStatus, string, string];

function expand(
  map: Record<AcquisitionAuditStage, CompactGap>
): AcquisitionGapRow[] {
  return ACQUISITION_AUDIT_STAGES.map(stage => {
    const [status, owner, evidence] = map[stage];
    return { stage, status, owner, evidence };
  });
}

const SHARED_GAPS = expand({
  discovery_qualification: [
    'exists_uncertified',
    'lib/leads',
    'Linktree/Beacons/Laylo; YouTube ICP is paste-first.',
  ],
  identity_resolution: [
    'exists_uncertified',
    'resolve-channel + waitlist',
    'No shared candidate/run record yet.',
  ],
  data_ingestion: [
    'exists_uncertified',
    'youtube-library + ingestion',
    'Paste preview + library sync exist. Premade ingest is JOV-5912.',
  ],
  experience_build: [
    'exists_uncertified',
    'JOV-5862 + snippet proposal',
    'Thumbs shipped. videos.update apply is JOV-5882.',
  ],
  machine_certification: [
    'exists_uncertified',
    'jovie.certification/v1 + YouTube rubric',
    'YouTube rubric is executable. Dogfood is JOV-5883.',
  ],
  ovi_human_review: [
    'exists_uncertified',
    'opportunity inbox',
    'Thumbnail cards exist. Acquisition review card is not wired.',
  ],
  rejection_rebuild: [
    'missing',
    'JOV-5911',
    'No shared reject → Linear product-gap → rebuild.',
  ],
  outreach_manual_send: [
    'exists_uncertified',
    'leads + evaluateAcquisitionDmSend',
    'Final DM is Tim-only. No YouTube send queue.',
  ],
  claim_activation: [
    'exists_uncertified',
    'claim + YouTube OAuth JOV-3189',
    'Connect exists. Experiment attribution is not end-to-end.',
  ],
  conversion_receipts: [
    'exists_uncertified',
    'youtube_packaging_experiment',
    'Packaging engine exists. Shared run writeback does not.',
  ],
  inbound_waitlist: [
    'exists_uncertified',
    'waitlist + homepage Find me',
    'Non-ICP mom-test is JOV-5884.',
  ],
});

const YOUTUBE_GAPS = expand({
  discovery_qualification: [
    'exists_uncertified',
    'qualifyRegularlyUploadingChannel',
    'ICP qualifier is executable. Outbound discovery is not wired.',
  ],
  identity_resolution: [
    'production_ready',
    'lib/youtube/resolve-channel.ts',
    'JOV-5862 handle / UC id / channel link resolver.',
  ],
  data_ingestion: [
    'production_ready',
    'youtube-library + paste preview',
    'Three-video preview and connected sync (JOV-3189 / JOV-5136).',
  ],
  experience_build: [
    'exists_uncertified',
    'JOV-5862 + insertJovieLink',
    'Thumbs paste-first shipped. videos.update apply is JOV-5882.',
  ],
  machine_certification: [
    'exists_uncertified',
    'machineCertifyYoutubeClosedLoop',
    'Rubric is executable. Dogfood is JOV-5883.',
  ],
  ovi_human_review: [
    'in_flight',
    'JOV-5158',
    'Founder-approved thumbnail apply is in progress. Do not steal that remediator.',
  ],
  rejection_rebuild: [
    'missing',
    'JOV-5911',
    'No YouTube-experiment product-gap rebuild loop.',
  ],
  outreach_manual_send: [
    'missing',
    'JOV-5881 step 6',
    'Outreach blocked until dogfood PASS.',
  ],
  claim_activation: [
    'exists_uncertified',
    'YouTube Connect JOV-3189',
    'Paste → Connect does not yet stamp experimentId on claim.',
  ],
  conversion_receipts: [
    'exists_uncertified',
    'youtube_packaging_experiment',
    'Watch-minutes-per-impression exists. Shared writeback does not.',
  ],
  inbound_waitlist: [
    'in_flight',
    'JOV-5884',
    'Homepage stays Find me. Non-ICP mom-test is a child issue.',
  ],
});

const PROFILE_GAPS = ACQUISITION_AUDIT_STAGES.map(stage => ({
  stage,
  status:
    stage === 'experience_build'
      ? 'in_flight'
      : stage === 'machine_certification' || stage === 'rejection_rebuild'
        ? 'missing'
        : 'exists_uncertified',
  owner: 'JOV-5912',
  evidence: 'Experiment 1. Do not fork the YouTube closed loop.',
})) as AcquisitionGapRow[];

export const ACQUISITION_GAP_AUDIT = {
  shared: SHARED_GAPS,
  experiments: {
    'premade-artist-profile': PROFILE_GAPS,
    'youtube-closed-loop': YOUTUBE_GAPS,
  },
} as const;

export const ACQUISITION_NEXT_PATHS: Record<
  LaunchExperimentId,
  AcquisitionNextPath
> = {
  'premade-artist-profile': {
    issue: 'JOV-5912',
    stage: 'experience_build',
    reason:
      'Build the premade profile on the shared kernel; do not fork YouTube.',
  },
  'youtube-closed-loop': {
    issue: 'JOV-5882',
    stage: 'experience_build',
    reason:
      'Apply titles, descriptions, and Jovie links via videos.update after Connect. Then JOV-5883 dogfood.',
  },
};

export function acquisitionGapRows(
  experimentId: LaunchExperimentId
): readonly AcquisitionGapRow[] {
  return ACQUISITION_GAP_AUDIT.experiments[experimentId];
}

export function nextAcquisitionPath(
  experimentId: LaunchExperimentId
): AcquisitionNextPath {
  return ACQUISITION_NEXT_PATHS[experimentId];
}

export function assertAuditCoversEveryStage(
  rows: readonly AcquisitionGapRow[]
): boolean {
  const stages = new Set(rows.map(row => row.stage));
  return ACQUISITION_AUDIT_STAGES.every(stage => stages.has(stage));
}
