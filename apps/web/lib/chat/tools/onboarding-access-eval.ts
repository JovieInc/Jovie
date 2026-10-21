/**
 * Deterministic access-decision evaluator (JOV-2132 PR 2).
 *
 * This is NOT an LLM tool. It is a server function called by the
 * `proposeNextStep` tool to decide whether the visitor should:
 *
 *   - `instant_access` — verified regularly uploading YouTube music artist, route to checkout
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
import { type CanonicalArtistMetrics } from '@/lib/onboarding/canonical-metrics';
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
      [signal.pastBehavior, signal.releaseStage, tool?.name]
        .filter(Boolean)
        .join('; ') || undefined,
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
   * Retained for telemetry; Spotify followers never grant admission.
   */
  readonly spotifyFollowers: number | null;
  /** Optional canonical metrics snapshot (preferred over bare followers). */
  readonly metrics?: CanonicalArtistMetrics | null;
  /** Number of LLM turns observed so far. Used to break stuck loops. */
  readonly turnCount: number;
  /** Server-resolved channel cadence and artist role, never a model score. */
  readonly youtubeQualified?: boolean;
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

/** Legacy recovery turn budget; it never substitutes for an interview answer. */
export const MAX_INTERVIEW_TURNS_BEFORE_FORCE = 3;

export const YOUTUBE_ARTIST_ACCESS_RATIONALE =
  'regularly_uploading_youtube_music_artist';

/**
 * Score the accumulated signal and return a routing decision.
 *
 * Pure function, deterministic, no I/O. Safe to call repeatedly across turns.
 *
 * An interview answer is required before either terminal outcome. Only
 * server-verified YouTube cadence plus a music artist role grants access.
 * Other visitors keep their interview context and reserve a waitlist spot.
 */
export function evaluateAccessSignal(
  input: AccessDecisionInput
): AccessDecision {
  const { signal } = input;

  const receipt = qualificationReceipt(toQualificationInput(signal));
  const qualification = {
    coveredDimensions: receipt.coveredDimensions,
    missingDimensions: receipt.missingDimensions,
    nextDimension: receipt.missingDimensions[0] ?? null,
  };

  // Identity and a counter/role alone are not a Mom Test interview.
  if (!signal.pastBehavior && !signal.currentTool?.name) {
    return {
      kind: 'needs_more_info',
      rationale: 'past_behavior_required',
      score: 10,
      qualification: { ...qualification, nextDimension: 'current_behavior' },
    };
  }

  // 1. A stated disqualifier (wrong audience) is an honest waitlist.
  if (receipt.disqualifiers.length > 0) {
    return {
      kind: 'waitlist',
      rationale: `disqualified_${receipt.disqualifiers.join('_')}`,
      score: 20,
      qualification,
    };
  }

  if (input.youtubeQualified) {
    return {
      kind: 'instant_access',
      rationale: YOUTUBE_ARTIST_ACCESS_RATIONALE,
      score: 90,
      qualification,
    };
  }

  return {
    kind: 'waitlist',
    rationale: 'youtube_artist_icp_required',
    score: 30,
    qualification,
  };
}

export interface OnboardingAccessInput {
  readonly accessControlled: boolean;
  readonly youtubeQualified?: boolean;
  readonly spotifyArtistId: string | null;
  /** Any public profile link (propose_social_link); qualifies non-artists. */
  readonly publicProfileUrl?: string | null;
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
 * The YouTube artist exception applies under either global gate setting.
 */
export function decideOnboardingAccess(
  input: OnboardingAccessInput
): AccessDecision {
  if (!input.spotifyArtistId && !input.publicProfileUrl) {
    return {
      kind: 'needs_more_info',
      rationale: 'public_profile_required_for_waitlist',
      score: 0,
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
    youtubeQualified: input.youtubeQualified,
  });
}
