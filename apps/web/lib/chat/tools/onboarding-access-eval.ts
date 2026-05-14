/**
 * Deterministic access-decision evaluator (JOV-2132 PR 2).
 *
 * This is NOT an LLM tool. It is a server function called by the
 * `proposeNextStep` tool to decide whether the visitor should:
 *
 *   - `instant_access` — Spotify-verified or has solid signal, route to checkout
 *   - `waitlist`       — qualifying signal too weak, defer with waitlist confirmation
 *   - `needs_more_info` — interview not complete enough to decide either way
 *
 * Keeping this deterministic prevents the LLM from owning the scoring logic
 * (which would let it hallucinate "you're getting instant access" without
 * the underlying signal). The LLM picks WHEN to evaluate; the server decides
 * WHAT the decision is.
 */

import type {
  AudienceBand,
  InterviewSignal,
  ReleaseStage,
} from './onboarding-signals';

export type AccessDecisionKind =
  | 'instant_access'
  | 'waitlist'
  | 'needs_more_info';

export interface AccessDecisionInput {
  /** Collapsed view of all interview signal so far. */
  readonly signal: InterviewSignal;
  /** Spotify follower count from confirmSpotifyArtist (if resolved). */
  readonly spotifyFollowers: number | null;
  /** Whether the picked Spotify artist is verified on Spotify. */
  readonly spotifyVerified: boolean;
  /** Number of LLM turns observed so far. Used to break stuck loops. */
  readonly turnCount: number;
}

export interface AccessDecision {
  readonly kind: AccessDecisionKind;
  /** Short rationale for logging + UI surfaces. Not user-facing copy. */
  readonly rationale: string;
  /** 0-100 confidence; useful for retroactive analysis of where to tune thresholds. */
  readonly score: number;
}

/** Maximum LLM turns before we force a decision even with weak signal. */
export const MAX_INTERVIEW_TURNS_BEFORE_FORCE = 3;

/** Spotify follower bands that auto-qualify for instant access. */
const INSTANT_ACCESS_FOLLOWER_THRESHOLD = 1_000;

const audienceBandRank: Record<AudienceBand, number> = {
  under_500: 0,
  '500_to_5k': 1,
  '5k_to_50k': 2,
  '50k_to_500k': 3,
  over_500k: 4,
};

const releaseStageRank: Record<ReleaseStage, number> = {
  no_active_release: 0,
  between_releases: 1,
  pre_announce: 2,
  announced_unreleased: 3,
  ongoing_rollout: 3,
  just_released: 4,
};

/**
 * Score the accumulated signal and return a routing decision.
 *
 * Pure function, deterministic, no I/O. Safe to call repeatedly across turns.
 *
 * Decision rules (top match wins):
 *  1. Spotify verified artist OR followers >= 1k → instant_access
 *  2. Audience band 5k+ → instant_access
 *  3. Audience band 500-5k AND active release stage → instant_access
 *  4. Hit MAX_INTERVIEW_TURNS_BEFORE_FORCE without instant-access signal → waitlist
 *  5. Otherwise → needs_more_info
 */
export function evaluateAccessSignal(
  input: AccessDecisionInput
): AccessDecision {
  const { signal, spotifyFollowers, spotifyVerified, turnCount } = input;

  // 1. Strong Spotify signal — instant access.
  if (spotifyVerified) {
    return {
      kind: 'instant_access',
      rationale: 'spotify_verified',
      score: 95,
    };
  }
  if (
    spotifyFollowers !== null &&
    spotifyFollowers >= INSTANT_ACCESS_FOLLOWER_THRESHOLD
  ) {
    return {
      kind: 'instant_access',
      rationale: `spotify_followers_${spotifyFollowers}`,
      score: 90,
    };
  }

  // 2. Strong self-reported audience signal.
  const audienceBand = signal.audienceBand;
  if (audienceBand && audienceBandRank[audienceBand] >= 2) {
    return {
      kind: 'instant_access',
      rationale: `audience_band_${audienceBand}`,
      score: 80,
    };
  }

  // 3. Mid audience + active release stage.
  const releaseStage = signal.releaseStage;
  if (
    audienceBand === '500_to_5k' &&
    releaseStage &&
    releaseStageRank[releaseStage] >= 3
  ) {
    return {
      kind: 'instant_access',
      rationale: `audience_${audienceBand}_with_active_release_${releaseStage}`,
      score: 70,
    };
  }

  // 4. Turn cap reached — force decision into waitlist.
  if (turnCount >= MAX_INTERVIEW_TURNS_BEFORE_FORCE) {
    return {
      kind: 'waitlist',
      rationale: `max_turns_reached_${turnCount}`,
      score: 30,
    };
  }

  // 5. Not enough signal yet — ask another question.
  return {
    kind: 'needs_more_info',
    rationale: 'insufficient_signal',
    score: 10,
  };
}
