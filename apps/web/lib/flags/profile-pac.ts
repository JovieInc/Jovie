export type ProfilePacCopyArm = 'default' | 'alternate';
export type ProfilePacTriggerThreshold = '30s' | 'track_complete';
export type ProfilePacS2Slot = 'merch' | 'tip' | 'tickets' | 'rsvp';
export type ProfilePacSlotKey = 'copyArm' | 'triggerThreshold' | 's2Slot';

export interface ProfilePacAssignment {
  readonly copyArm: ProfilePacCopyArm;
  readonly triggerThreshold: ProfilePacTriggerThreshold;
  readonly s2Slot: ProfilePacS2Slot;
}

export interface ProfilePacArmMetrics {
  readonly arm: string;
  readonly exposures: number;
  readonly captures: number;
  readonly dismissals: number;
  readonly revenueCents?: number;
}

export interface ProfilePacPromotionInput {
  readonly slot: ProfilePacSlotKey;
  readonly control: ProfilePacArmMetrics;
  readonly candidate: ProfilePacArmMetrics;
  readonly minExposuresPerArm?: number;
  readonly zScoreThreshold?: number;
  readonly minRewardLiftCents?: number;
}

export interface ProfilePacPromotionRecommendation {
  readonly slot: ProfilePacSlotKey;
  readonly winningArm: string;
  readonly previousArm: string;
  readonly reason: 'capture_rate_significant' | 'revenue_reward_significant';
  readonly zScore: number;
  readonly doNoHarm: {
    readonly captureRateDelta: number;
    readonly dismissalRateDelta: number;
  };
  readonly configPatch: Partial<ProfilePacAssignment>;
  readonly reversible: true;
}

export const DEFAULT_PROFILE_PAC_ASSIGNMENT: ProfilePacAssignment = {
  copyArm: 'default',
  triggerThreshold: '30s',
  s2Slot: 'merch',
};

const COPY_ARMS = new Set<ProfilePacCopyArm>(['default', 'alternate']);
const TRIGGER_THRESHOLDS = new Set<ProfilePacTriggerThreshold>([
  '30s',
  'track_complete',
]);
const S2_SLOTS = new Set<ProfilePacS2Slot>(['merch', 'tip', 'tickets', 'rsvp']);

function readString(config: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

export function parseProfilePacAssignment(
  config: Record<string, unknown>
): ProfilePacAssignment {
  const copyArm = readString(config, ['copyArm', 'copy_arm']);
  const triggerThreshold = readString(config, [
    'triggerThreshold',
    'trigger_threshold',
  ]);
  const s2Slot = readString(config, ['s2Slot', 's2_slot']);

  return {
    copyArm: COPY_ARMS.has(copyArm as ProfilePacCopyArm)
      ? (copyArm as ProfilePacCopyArm)
      : DEFAULT_PROFILE_PAC_ASSIGNMENT.copyArm,
    triggerThreshold: TRIGGER_THRESHOLDS.has(
      triggerThreshold as ProfilePacTriggerThreshold
    )
      ? (triggerThreshold as ProfilePacTriggerThreshold)
      : DEFAULT_PROFILE_PAC_ASSIGNMENT.triggerThreshold,
    s2Slot: S2_SLOTS.has(s2Slot as ProfilePacS2Slot)
      ? (s2Slot as ProfilePacS2Slot)
      : DEFAULT_PROFILE_PAC_ASSIGNMENT.s2Slot,
  };
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function twoProportionZScore(params: {
  readonly controlSuccesses: number;
  readonly controlTotal: number;
  readonly candidateSuccesses: number;
  readonly candidateTotal: number;
}) {
  const { controlSuccesses, controlTotal, candidateSuccesses, candidateTotal } =
    params;
  if (controlTotal <= 0 || candidateTotal <= 0) {
    return 0;
  }

  const pooled =
    (controlSuccesses + candidateSuccesses) / (controlTotal + candidateTotal);
  const standardError = Math.sqrt(
    pooled * (1 - pooled) * (1 / controlTotal + 1 / candidateTotal)
  );
  if (standardError === 0) {
    return 0;
  }

  return (
    (candidateSuccesses / candidateTotal - controlSuccesses / controlTotal) /
    standardError
  );
}

function buildPatch(
  slot: ProfilePacSlotKey,
  winningArm: string
): Partial<ProfilePacAssignment> {
  if (slot === 'copyArm' && COPY_ARMS.has(winningArm as ProfilePacCopyArm)) {
    return { copyArm: winningArm as ProfilePacCopyArm };
  }
  if (
    slot === 'triggerThreshold' &&
    TRIGGER_THRESHOLDS.has(winningArm as ProfilePacTriggerThreshold)
  ) {
    return { triggerThreshold: winningArm as ProfilePacTriggerThreshold };
  }
  if (slot === 's2Slot' && S2_SLOTS.has(winningArm as ProfilePacS2Slot)) {
    return { s2Slot: winningArm as ProfilePacS2Slot };
  }
  return {};
}

export function evaluateProfilePacPromotion(
  input: ProfilePacPromotionInput
): ProfilePacPromotionRecommendation | null {
  const minExposuresPerArm = input.minExposuresPerArm ?? 200;
  if (
    input.control.exposures < minExposuresPerArm ||
    input.candidate.exposures < minExposuresPerArm
  ) {
    return null;
  }

  const controlCaptureRate = rate(
    input.control.captures,
    input.control.exposures
  );
  const candidateCaptureRate = rate(
    input.candidate.captures,
    input.candidate.exposures
  );
  const controlDismissalRate = rate(
    input.control.dismissals,
    input.control.exposures
  );
  const candidateDismissalRate = rate(
    input.candidate.dismissals,
    input.candidate.exposures
  );
  const doNoHarm = {
    captureRateDelta: candidateCaptureRate - controlCaptureRate,
    dismissalRateDelta: candidateDismissalRate - controlDismissalRate,
  };

  if (doNoHarm.captureRateDelta < 0 || doNoHarm.dismissalRateDelta > 0) {
    return null;
  }

  const zScoreThreshold = input.zScoreThreshold ?? 1.96;
  let zScore: number;
  let reason: ProfilePacPromotionRecommendation['reason'];

  if (input.slot === 's2Slot') {
    const controlReward = rate(
      input.control.revenueCents ?? 0,
      input.control.exposures
    );
    const candidateReward = rate(
      input.candidate.revenueCents ?? 0,
      input.candidate.exposures
    );
    if (candidateReward - controlReward < (input.minRewardLiftCents ?? 1)) {
      return null;
    }
    zScore = twoProportionZScore({
      controlSuccesses: input.control.captures,
      controlTotal: input.control.exposures,
      candidateSuccesses: input.candidate.captures,
      candidateTotal: input.candidate.exposures,
    });
    reason = 'revenue_reward_significant';
  } else {
    zScore = twoProportionZScore({
      controlSuccesses: input.control.captures,
      controlTotal: input.control.exposures,
      candidateSuccesses: input.candidate.captures,
      candidateTotal: input.candidate.exposures,
    });
    reason = 'capture_rate_significant';
  }

  if (zScore < zScoreThreshold) {
    return null;
  }

  const configPatch = buildPatch(input.slot, input.candidate.arm);
  if (Object.keys(configPatch).length === 0) {
    return null;
  }

  return {
    slot: input.slot,
    winningArm: input.candidate.arm,
    previousArm: input.control.arm,
    reason,
    zScore,
    doNoHarm,
    configPatch,
    reversible: true,
  };
}
