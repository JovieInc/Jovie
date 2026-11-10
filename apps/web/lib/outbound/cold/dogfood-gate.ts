/**
 * Dogfood gate for outreach (hard rule, 2026-10-29).
 *
 * No outreach draft reaches Tim, and nothing is sent, unless both of these
 * passed the LLM dogfood judge (vision review against Tim's taste rubric and
 * the Pen designs):
 * - the artifact built for this prospect (profile, release page or video);
 * - the onboarding flow the prospect lands in after claiming.
 *
 * Fail-closed: a missing, failing, stale or unreadable verdict blocks. Until
 * the judge publishes verdicts, every verdict is unknown and the gate stays
 * shut. Pure; the server reader supplies the verdicts.
 */

export const DOGFOOD_GATE_VERSION = 'outreach-dogfood-gate/v1';

/** A verdict older than this no longer counts; the subject is re-judged. */
export const DOGFOOD_VERDICT_MAX_AGE_DAYS = 14;

export interface DogfoodVerdict {
  readonly subject: 'artifact' | 'onboarding';
  /** Profile id for an artifact; flow revision for onboarding. */
  readonly subjectId: string;
  readonly pass: boolean;
  readonly judgedAt: Date;
  readonly rubricVersion: string;
}

export type DogfoodBlock =
  | 'onboarding_not_judged'
  | 'onboarding_failed'
  | 'onboarding_stale'
  | 'artifact_not_judged'
  | 'artifact_failed'
  | 'artifact_stale';

export const DOGFOOD_BLOCK_LABELS: Record<DogfoodBlock, string> = {
  onboarding_not_judged: 'Onboarding flow not judged yet',
  onboarding_failed: 'Onboarding flow failed the dogfood judge',
  onboarding_stale: 'Onboarding verdict is out of date',
  artifact_not_judged: 'Built page not judged yet',
  artifact_failed: 'Built page failed the dogfood judge',
  artifact_stale: 'Built page verdict is out of date',
};

export interface DogfoodGateResult {
  readonly passed: boolean;
  readonly blocks: readonly DogfoodBlock[];
}

function check(
  verdict: DogfoodVerdict | null,
  kind: 'artifact' | 'onboarding',
  now: Date
): DogfoodBlock | null {
  if (!verdict || verdict.subject !== kind) return `${kind}_not_judged`;
  if (!verdict.pass) return `${kind}_failed`;
  const age = now.getTime() - verdict.judgedAt.getTime();
  if (
    Number.isNaN(age) ||
    age < 0 ||
    age > DOGFOOD_VERDICT_MAX_AGE_DAYS * 86_400_000
  )
    return `${kind}_stale`;
  return null;
}

/** The onboarding flow alone: blocks every send and every draft when it fails. */
export function evaluateOnboardingGate(
  onboarding: DogfoodVerdict | null,
  now: Date
): DogfoodGateResult {
  const block = check(onboarding, 'onboarding', now);
  return { passed: block === null, blocks: block ? [block] : [] };
}

/** Both the prospect's artifact and the onboarding flow must pass. */
export function evaluateDogfoodGate(input: {
  readonly artifact: DogfoodVerdict | null;
  readonly onboarding: DogfoodVerdict | null;
  readonly now: Date;
}): DogfoodGateResult {
  const blocks = [
    check(input.onboarding, 'onboarding', input.now),
    check(input.artifact, 'artifact', input.now),
  ].filter((block): block is DogfoodBlock => block !== null);
  return { passed: blocks.length === 0, blocks };
}

/** The closed result used whenever verdicts could not be read. */
export const DOGFOOD_GATE_CLOSED: DogfoodGateResult = Object.freeze({
  passed: false,
  blocks: ['onboarding_not_judged', 'artifact_not_judged'] as const,
});
