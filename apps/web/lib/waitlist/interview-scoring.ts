import type { WaitlistRequestPayload } from '@/lib/validation/schemas';

/**
 * Deterministic scorer for the qualifying onboarding interview (JOV-3380).
 *
 * Scores the intake-chat answers to decide admit-vs-waitlist when the
 * waitlist gate is ON. This intentionally mirrors the philosophy of
 * `lib/chat/tools/onboarding-access-eval.ts` (server owns the decision,
 * never an LLM) but operates on the structured intake-form payload used by
 * `POST /api/onboarding/intake` rather than chat-tool signal.
 *
 * Pure function, no I/O — safe to call from routes and inside the
 * access-request transaction path.
 */

export interface InterviewResponses {
  /** "What are you working on or releasing next?" */
  readonly currentWorkflow?: string | null;
  /** "What is the most annoying part of that workflow right now?" */
  readonly biggestBlocker?: string | null;
  /** "What would make Jovie obviously useful for you this quarter?" */
  readonly launchGoal?: string | null;
}

export interface InterviewScoreInput {
  readonly payload: WaitlistRequestPayload;
  readonly responses: InterviewResponses;
}

export interface InterviewScoreResult {
  /** 0-100 aggregate intent score. */
  readonly score: number;
  /** True when the score clears INTERVIEW_ADMIT_THRESHOLD. */
  readonly admit: boolean;
  /** Signal names that contributed to the score (for audit + Eve analysis). */
  readonly signals: readonly string[];
}

/** Score at or above which a gate-on signup is admitted with full access. */
export const INTERVIEW_ADMIT_THRESHOLD = 60;

/** Release-cycle language indicating an active, near-term music workflow. */
const ACTIVE_RELEASE_PATTERN =
  /\b(releas\w*|single|ep|album|mixtape|tour\w*|drop\w*|rollout|distribut\w*|pre-?save|catalog|show|gig|festival)\b/i;

/** Role language indicating a high-intent artist/manager/label persona. */
const HIGH_INTENT_ROLE_PATTERN =
  /\b(artist|band|manager|label|producer|songwriter|dj|booking)\b/i;

/** Minimum trimmed length for a problem statement to count as substantive. */
const SUBSTANTIVE_PROBLEM_MIN_LENGTH = 20;

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Score the qualifying interview and return an admit-or-waitlist
 * recommendation.
 *
 * Signal weights (capped at 100):
 *  - Spotify artist identity (URL + name)                 +30
 *  - Spotify URL alone                                    +15
 *  - Active release language in workflow/goal answers     +25
 *  - Substantive problem statement (biggest blocker)      +20
 *  - High-intent role language anywhere in answers        +10
 *  - Paid plan interest                                   +15
 *
 * Threshold 60 is deliberately conservative: an artist with a Spotify
 * identity, an active release, and a real problem statement clears it;
 * empty or low-signal submissions stay waitlisted (demand-gated growth).
 */
export function scoreOnboardingInterview(
  input: InterviewScoreInput
): InterviewScoreResult {
  const { payload, responses } = input;
  const signals: string[] = [];
  let score = 0;

  const hasSpotifyUrl = hasText(payload.spotifyUrl);
  const hasSpotifyName = hasText(payload.spotifyArtistName);
  if (hasSpotifyUrl && hasSpotifyName) {
    score += 30;
    signals.push('spotify_artist_identity');
  } else if (hasSpotifyUrl) {
    score += 15;
    signals.push('spotify_url');
  }

  const workflowText = [responses.currentWorkflow, responses.launchGoal]
    .filter(hasText)
    .join(' ');
  if (ACTIVE_RELEASE_PATTERN.test(workflowText)) {
    score += 25;
    signals.push('active_release_language');
  }

  const problemStatement = responses.biggestBlocker?.trim() ?? '';
  if (problemStatement.length >= SUBSTANTIVE_PROBLEM_MIN_LENGTH) {
    score += 20;
    signals.push('substantive_problem_statement');
  }

  const allAnswerText = [
    responses.currentWorkflow,
    responses.biggestBlocker,
    responses.launchGoal,
    payload.heardAbout,
  ]
    .filter(hasText)
    .join(' ');
  if (HIGH_INTENT_ROLE_PATTERN.test(allAnswerText)) {
    score += 10;
    signals.push('high_intent_role');
  }

  if (hasText(payload.selectedPlan) && payload.selectedPlan !== 'free') {
    score += 15;
    signals.push('paid_plan_interest');
  }

  const finalScore = Math.min(score, 100);
  return {
    score: finalScore,
    admit: finalScore >= INTERVIEW_ADMIT_THRESHOLD,
    signals,
  };
}
