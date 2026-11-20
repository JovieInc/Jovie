/**
 * Admission score: "best leads first" (Tim, 2026-10-25).
 *
 * Pending entrants are ranked by this score and each day's auto-accept budget
 * goes to the top N. Pure and versioned: the score, its components and every
 * input are stored on the waitlist entry (`qualification_inputs.admissionScore`)
 * so the ranking is explainable and can be re-tuned from outcomes.
 *
 * v1 weights are a taste default, not validated against paid outcomes (there
 * are none yet). Measure admitted-artist activation and retention by score
 * band before changing them; do not tune on volume this small.
 *
 * Components (max 100):
 * - identity 30: the server confirmed a Spotify artist.
 * - audience 30: followers on a log scale to the claim-verification threshold
 *   (20), plus Spotify popularity (10).
 * - catalog 20: release count (10) and a release in the last 180 days (10).
 *   Not measurable before the identity is linked, so it scores 0 and is listed
 *   under `unmeasured` until a catalog read exists at queue time.
 * - intent 20: an active release moment (12, less between releases) and a
 *   completed chat (8).
 */
export const ADMISSION_SCORE_VERSION = 'admission-score/v1' as const;

export type AdmissionReleaseStage =
  | 'no_active_release'
  | 'pre_announce'
  | 'announced_unreleased'
  | 'just_released'
  | 'ongoing_rollout'
  | 'between_releases';

export interface AdmissionScoreInputs {
  readonly identityResolved: boolean;
  readonly followers: number | null;
  readonly popularity: number | null;
  /** Null until a catalog read exists at queue time. */
  readonly catalogReleases: number | null;
  readonly latestReleaseAt: string | null;
  readonly releaseStage: AdmissionReleaseStage | null;
  /** Assistant turns in the onboarding chat; 3+ counts as a completed chat. */
  readonly chatTurns: number;
}

export interface AdmissionScore {
  readonly version: typeof ADMISSION_SCORE_VERSION;
  readonly score: number;
  readonly components: {
    readonly identity: number;
    readonly audience: number;
    readonly catalog: number;
    readonly intent: number;
  };
  readonly inputs: AdmissionScoreInputs;
  /** Inputs that could not be measured, so a zero is not a judgment. */
  readonly unmeasured: readonly string[];
}

const AUDIENCE_FOLLOWER_CAP = 50_000;
const RECENT_RELEASE_DAYS = 180;
const COMPLETED_CHAT_TURNS = 3;
const ACTIVE_STAGES: readonly AdmissionReleaseStage[] = [
  'pre_announce',
  'announced_unreleased',
  'just_released',
  'ongoing_rollout',
];

const round1 = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, max: number): number =>
  Math.min(max, Math.max(0, value));

export function scoreAdmissionCandidate(
  inputs: AdmissionScoreInputs,
  now: Date = new Date()
): AdmissionScore {
  const identity = inputs.identityResolved ? 30 : 0;

  const followers =
    inputs.followers !== null && inputs.followers > 0 ? inputs.followers : 0;
  const followerPoints = clamp(
    (20 * Math.log10(1 + followers)) / Math.log10(1 + AUDIENCE_FOLLOWER_CAP),
    20
  );
  const popularityPoints = clamp(((inputs.popularity ?? 0) / 100) * 10, 10);
  const audience = round1(followerPoints + popularityPoints);

  const unmeasured: string[] = [];
  let catalog = 0;
  if (inputs.catalogReleases === null) {
    unmeasured.push('catalog');
  } else {
    catalog += clamp(inputs.catalogReleases, 10);
    if (inputs.latestReleaseAt) {
      const ageDays =
        (now.getTime() - new Date(inputs.latestReleaseAt).getTime()) /
        86_400_000;
      if (Number.isFinite(ageDays) && ageDays <= RECENT_RELEASE_DAYS) {
        catalog += 10;
      }
    }
  }

  let intent = 0;
  if (inputs.releaseStage && ACTIVE_STAGES.includes(inputs.releaseStage)) {
    intent += 12;
  } else if (inputs.releaseStage === 'between_releases') {
    intent += 4;
  }
  if (inputs.chatTurns >= COMPLETED_CHAT_TURNS) intent += 8;

  const components = { identity, audience, catalog, intent };
  return {
    version: ADMISSION_SCORE_VERSION,
    score: round1(identity + audience + catalog + intent),
    components,
    inputs,
    unmeasured,
  };
}

/**
 * Online top-N rule: with `remaining` slots left today, a candidate is
 * admitted now only if no `remaining` pending entrants outrank them. Fewer
 * pending entrants than slots means everyone fits.
 */
export function isOutrankedByQueue(input: {
  readonly candidateScore: number;
  /** Pending entrants' scores, best first. */
  readonly pendingScoresDesc: readonly number[];
  readonly remainingSlots: number;
}): boolean {
  if (input.remainingSlots <= 0) return true;
  if (input.pendingScoresDesc.length < input.remainingSlots) return false;
  return (
    input.candidateScore < input.pendingScoresDesc[input.remainingSlots - 1]
  );
}
