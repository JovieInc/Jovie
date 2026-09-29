/**
 * Deterministic access-decision evaluator (JOV-2132 PR 2).
 *
 * This is NOT an LLM tool. It is a server function called by the
 * `proposeNextStep` tool to decide whether the visitor should:
 *
 *   - `instant_access` — Spotify/social audience has solid signal, route to checkout
 *   - `waitlist`       — qualifying signal too weak, defer with waitlist confirmation
 *   - `needs_more_info` — interview not complete enough to decide either way
 *
 * Keeping this deterministic prevents the LLM from owning the scoring logic
 * (which would let it hallucinate "you're getting instant access" without
 * the underlying signal). The LLM picks WHEN to evaluate; the server decides
 * WHAT the decision is.
 */

import {
  type MomTestDimension,
  type QualificationInput,
  qualificationReceipt,
} from '@/lib/acquisition/conversation-loop';
import {
  type CanonicalArtistMetrics,
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import {
  type AudienceBand,
  collapseInterviewSignals,
  type InterviewSignal,
  type InterviewSignalsMetadata,
  type ReleaseStage,
} from './onboarding-signals';

const URGENT_RELEASE_STAGES: ReadonlySet<ReleaseStage> = new Set([
  'pre_announce',
  'announced_unreleased',
  'just_released',
  'ongoing_rollout',
]);

/**
 * JOV-7144: map collapsed onboarding signals onto the shared Mom-Test
 * qualification contract (`lib/acquisition/conversation-loop.ts`) so
 * `/start` qualifies on the same dimensions as every other channel.
 * Self-reported audience size is evidence of current behavior only; it is
 * never proof on its own.
 */
export function toQualificationInput(
  signal: InterviewSignal
): QualificationInput {
  const tool = signal.currentTool;
  const urgent = signal.releaseStage
    ? URGENT_RELEASE_STAGES.has(signal.releaseStage)
    : false;
  const answers: QualificationInput['answers'] = {
    current_behavior:
      [signal.releaseStage, tool?.name].filter(Boolean).join('; ') || undefined,
    alternatives: tool?.name,
    pain: tool?.note ?? signal.objection?.text,
    urgency: urgent ? signal.releaseStage : undefined,
    desired_outcome: signal.freeNote,
  };
  return {
    answers,
    evidence: [],
    disqualifiers:
      signal.objection?.category === 'wrong_audience' ? ['wrong_audience'] : [],
    hasCurrentSpend: false,
    hasAuthority: true,
    hasConcreteUrgency: urgent,
  };
}

export type AccessDecisionKind =
  | 'instant_access'
  | 'waitlist'
  | 'needs_more_info';

export interface AccessDecisionInput {
  /** Collapsed view of all interview signal so far. */
  readonly signal: InterviewSignal;
  /**
   * Spotify follower count from confirmSpotifyArtist (if resolved).
   * Prefer `metrics` when available — this field is normalized either way.
   */
  readonly spotifyFollowers: number | null;
  /** Optional canonical metrics snapshot (preferred over bare followers). */
  readonly metrics?: CanonicalArtistMetrics | null;
  /** Number of LLM turns observed so far. Used to break stuck loops. */
  readonly turnCount: number;
}

export interface AccessDecision {
  readonly kind: AccessDecisionKind;
  /** Short rationale for logging + UI surfaces. Not user-facing copy. */
  readonly rationale: string;
  /** 0-100 confidence; useful for retroactive analysis of where to tune thresholds. */
  readonly score: number;
  /**
   * JOV-7144: Mom-Test coverage from the shared qualification contract. The
   * model asks one past-behavior question about `nextDimension` next.
   */
  readonly qualification?: {
    readonly coveredDimensions: readonly MomTestDimension[];
    readonly missingDimensions: readonly MomTestDimension[];
    readonly nextDimension: MomTestDimension | null;
  };
}

/** Maximum LLM turns before we force a decision even with weak signal. */
export const MAX_INTERVIEW_TURNS_BEFORE_FORCE = 3;

/** Spotify follower bands that auto-qualify for instant access. */
const INSTANT_ACCESS_FOLLOWER_THRESHOLD = 1_000;

/**
 * Score the accumulated signal and return a routing decision.
 *
 * Pure function, deterministic, no I/O. Safe to call repeatedly across turns.
 *
 * Decision rules (top match wins):
 *  1. Stated disqualifier (wrong audience) → waitlist
 *  2. Verified Spotify followers >= 1k → instant_access
 *  3. Hit MAX_INTERVIEW_TURNS_BEFORE_FORCE without verified signal → waitlist
 *  4. Otherwise → needs_more_info, naming the next Mom-Test dimension
 */
export function evaluateAccessSignal(
  input: AccessDecisionInput
): AccessDecision {
  const { signal, turnCount } = input;

  // Always resolve followers through the canonical metrics contract so access
  // decisions cannot mix monthly listeners into the follower threshold.
  const metrics =
    input.metrics ??
    normalizeArtistMetrics(
      { spotifyFollowers: input.spotifyFollowers },
      { source: 'tool_output' }
    );
  const spotifyFollowers = getDisplaySpotifyFollowers(metrics);

  const receipt = qualificationReceipt(toQualificationInput(signal));
  const qualification = {
    coveredDimensions: receipt.coveredDimensions,
    missingDimensions: receipt.missingDimensions,
    nextDimension: receipt.missingDimensions[0] ?? null,
  };

  // 1. A stated disqualifier (wrong audience) is an honest waitlist.
  if (receipt.disqualifiers.length > 0) {
    return {
      kind: 'waitlist',
      rationale: `disqualified_${receipt.disqualifiers.join('_')}`,
      score: 20,
      qualification,
    };
  }

  // 2. Verified Spotify signal (server-derived, JOV-7143) — instant access.
  if (
    spotifyFollowers !== null &&
    spotifyFollowers >= INSTANT_ACCESS_FOLLOWER_THRESHOLD
  ) {
    return {
      kind: 'instant_access',
      rationale: `spotify_followers_${spotifyFollowers}`,
      score: 90,
      qualification,
    };
  }

  // 3. Turn cap reached — force decision into waitlist. Self-reported audience
  //    size never grants access on its own (JOV-7144): it is unverified.
  if (turnCount >= MAX_INTERVIEW_TURNS_BEFORE_FORCE) {
    return {
      kind: 'waitlist',
      rationale: `max_turns_reached_${turnCount}`,
      score: 30,
      qualification,
    };
  }

  // 4. Not enough signal yet — ask about the next uncovered Mom-Test dimension.
  return {
    kind: 'needs_more_info',
    rationale: 'insufficient_signal',
    score: 10,
    qualification,
  };
}

export interface OnboardingAccessInput {
  readonly accessControlled: boolean;
  readonly spotifyArtistId: string | null;
  readonly spotifyFollowers: number | null;
  readonly metrics?: CanonicalArtistMetrics | null;
  readonly signals: readonly Omit<
    InterviewSignalsMetadata['signals'][number],
    'recordedAt'
  >[];
  readonly turnCount: number;
  /** A band parsed from the current turn that has not been recorded yet. */
  readonly extraBand?: AudienceBand | null;
}

/**
 * JOV-7144: the single onboarding access gate, shared by the LLM tool
 * (`proposeNextStep`) and the scripted fallback engine so they cannot drift.
 * The DB-backed controlled-access gate stays authoritative.
 */
export function decideOnboardingAccess(
  input: OnboardingAccessInput
): AccessDecision {
  if (input.accessControlled) {
    if (!input.spotifyArtistId) {
      return {
        kind: 'needs_more_info',
        rationale: 'confirmed_artist_required_for_waitlist',
        score: 0,
      };
    }
    return {
      kind: 'waitlist',
      rationale: 'controlled_access_gate_enabled',
      score: 100,
    };
  }
  const recordedAt = new Date().toISOString();
  const signals = input.signals.map(signal => ({ ...signal, recordedAt }));
  if (input.extraBand) {
    signals.push({ audienceBand: input.extraBand, recordedAt });
  }
  return evaluateAccessSignal({
    signal: collapseInterviewSignals(signals),
    spotifyFollowers: input.spotifyFollowers,
    metrics: input.metrics,
    turnCount: input.turnCount,
  });
}
