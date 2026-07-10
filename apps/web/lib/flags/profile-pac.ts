/**
 * Public profile PAC (Primary Action Card) experiment assignment +
 * auto-promotion rules.
 *
 * Slots (JOV-3906 base + JOV-3907/3908 component arms):
 * - copyArm — S1 capture copy
 * - triggerThreshold — S1 listen threshold before capture prompt
 * - s2Slot — S2 monetization slot
 * - tabBar — cold-visitor bottom tab bar visibility (JOV-3907)
 * - dismissAffordance — capture prompt dismiss control (JOV-3908)
 */

export type ProfilePacCopyArm = 'default' | 'alternate';
export type ProfilePacTriggerThreshold = '30s' | 'track_complete';
export type ProfilePacS2Slot = 'merch' | 'tip' | 'tickets' | 'rsvp';
/** Cold-visitor tab bar experiment (JOV-3907). Default ships `visible`. */
export type ProfilePacTabBar = 'hidden' | 'visible';
/**
 * Capture dismiss affordance experiment (JOV-3908).
 * Default ships text "Not now"; candidate is borderless icon-X.
 */
export type ProfilePacDismissAffordance = 'text' | 'icon';

export type ProfilePacSlotKey =
  | 'copyArm'
  | 'triggerThreshold'
  | 's2Slot'
  | 'tabBar'
  | 'dismissAffordance';

export interface ProfilePacAssignment {
  readonly copyArm: ProfilePacCopyArm;
  readonly triggerThreshold: ProfilePacTriggerThreshold;
  readonly s2Slot: ProfilePacS2Slot;
  readonly tabBar: ProfilePacTabBar;
  readonly dismissAffordance: ProfilePacDismissAffordance;
}

export interface ProfilePacArmMetrics {
  readonly arm: string;
  readonly exposures: number;
  readonly captures: number;
  readonly dismissals: number;
  /** Play starts (pac_play_start) — used by the tab-bar experiment. */
  readonly plays?: number;
  /**
   * Any-interaction / engagement count (scroll depth or interaction rate
   * proxy) — do-no-harm floor for the tab-bar experiment.
   */
  readonly engagements?: number;
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
  readonly reason:
    | 'capture_rate_significant'
    | 'revenue_reward_significant'
    | 'play_and_capture_rate_significant';
  readonly zScore: number;
  readonly doNoHarm: {
    readonly captureRateDelta: number;
    readonly dismissalRateDelta: number;
    readonly engagementRateDelta?: number;
  };
  readonly configPatch: Partial<ProfilePacAssignment>;
  readonly reversible: true;
}

export const DEFAULT_PROFILE_PAC_ASSIGNMENT: ProfilePacAssignment = {
  copyArm: 'default',
  triggerThreshold: '30s',
  s2Slot: 'merch',
  // Control arms for component experiments — Statsig 50/50 overrides.
  tabBar: 'visible',
  dismissAffordance: 'text',
};

const COPY_ARMS = new Set<ProfilePacCopyArm>(['default', 'alternate']);
const TRIGGER_THRESHOLDS = new Set<ProfilePacTriggerThreshold>([
  '30s',
  'track_complete',
]);
const S2_SLOTS = new Set<ProfilePacS2Slot>(['merch', 'tip', 'tickets', 'rsvp']);
const TAB_BARS = new Set<ProfilePacTabBar>(['hidden', 'visible']);
const DISMISS_AFFORDANCES = new Set<ProfilePacDismissAffordance>([
  'text',
  'icon',
]);

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
  const tabBar = readString(config, ['tabBar', 'tab_bar']);
  const dismissAffordance = readString(config, [
    'dismissAffordance',
    'dismiss_affordance',
  ]);

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
    tabBar: TAB_BARS.has(tabBar as ProfilePacTabBar)
      ? (tabBar as ProfilePacTabBar)
      : DEFAULT_PROFILE_PAC_ASSIGNMENT.tabBar,
    dismissAffordance: DISMISS_AFFORDANCES.has(
      dismissAffordance as ProfilePacDismissAffordance
    )
      ? (dismissAffordance as ProfilePacDismissAffordance)
      : DEFAULT_PROFILE_PAC_ASSIGNMENT.dismissAffordance,
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
  if (slot === 'tabBar' && TAB_BARS.has(winningArm as ProfilePacTabBar)) {
    return { tabBar: winningArm as ProfilePacTabBar };
  }
  if (
    slot === 'dismissAffordance' &&
    DISMISS_AFFORDANCES.has(winningArm as ProfilePacDismissAffordance)
  ) {
    return { dismissAffordance: winningArm as ProfilePacDismissAffordance };
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
  const controlEngagementRate = rate(
    input.control.engagements ?? 0,
    input.control.exposures
  );
  const candidateEngagementRate = rate(
    input.candidate.engagements ?? 0,
    input.candidate.exposures
  );
  const doNoHarm = {
    captureRateDelta: candidateCaptureRate - controlCaptureRate,
    dismissalRateDelta: candidateDismissalRate - controlDismissalRate,
    engagementRateDelta: candidateEngagementRate - controlEngagementRate,
  };

  // Shared capture floor — never promote an arm that hurts captures.
  if (doNoHarm.captureRateDelta < 0) {
    return null;
  }

  // Dismissal-rate guardrail (JOV-3908 / shared): never promote an arm that
  // raises dismissals — including dark-pattern dismiss affordances.
  if (doNoHarm.dismissalRateDelta > 0) {
    return null;
  }

  // Tab-bar do-no-harm floor (JOV-3907): session engagement must not degrade.
  if (
    input.slot === 'tabBar' &&
    (input.control.engagements !== undefined ||
      input.candidate.engagements !== undefined) &&
    doNoHarm.engagementRateDelta < 0
  ) {
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
  } else if (input.slot === 'tabBar') {
    // Promote on play-start rate AND capture-rate joint evidence.
    const playZ = twoProportionZScore({
      controlSuccesses: input.control.plays ?? 0,
      controlTotal: input.control.exposures,
      candidateSuccesses: input.candidate.plays ?? 0,
      candidateTotal: input.candidate.exposures,
    });
    const captureZ = twoProportionZScore({
      controlSuccesses: input.control.captures,
      controlTotal: input.control.exposures,
      candidateSuccesses: input.candidate.captures,
      candidateTotal: input.candidate.exposures,
    });
    // Both metrics must clear the threshold (joint win, not cherry-picked).
    if (playZ < zScoreThreshold || captureZ < zScoreThreshold) {
      return null;
    }
    zScore = Math.min(playZ, captureZ);
    reason = 'play_and_capture_rate_significant';
  } else {
    zScore = twoProportionZScore({
      controlSuccesses: input.control.captures,
      controlTotal: input.control.exposures,
      candidateSuccesses: input.candidate.captures,
      candidateTotal: input.candidate.exposures,
    });
    reason = 'capture_rate_significant';
  }

  if (input.slot !== 'tabBar' && zScore < zScoreThreshold) {
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
