import {
  PRESENCE_BUILD_STEPS,
  type PresenceBuildStepId,
} from '@/lib/onboarding/presence-build/constants';
import type {
  PresenceBuildFact,
  PresenceBuildStepState,
} from '@/lib/onboarding/presence-build/types';

/**
 * Computed proof generator (JOV-7750): claim-time findings from the
 * visitor's own public presence.
 *
 * The presence-build steps resolve real data from the visitor's profile and
 * connected sources. This module turns their completed artifacts into proof
 * findings for the pre-paywall reveal. A finding is a real, non-zero fact;
 * zero counts and "not connected" states are honest in the step card but are
 * not proof, so they are dropped. No finding means the proof slot hides. It
 * never falls back to a sample or placeholder number.
 */

/** Computed proof slots; golden-path claims cite these as their evidence. */
export const COMPUTED_PROOF_SLOTS = {
  'presence-signals': {
    step: 'research_artist',
    proves: 'Jovie found the visitor’s real public identity and sources.',
  },
  'work-opportunities': {
    step: 'surface_library_opportunities',
    proves: 'Jovie found open work for this visitor in their own catalog.',
  },
  'assembled-profile': {
    step: 'assemble_profile',
    proves: 'Jovie built a profile from the visitor’s own data.',
  },
  'live-profile-url': {
    step: 'generate_smart_link',
    proves: 'The visitor’s profile is live at their own URL.',
  },
} as const satisfies Record<
  string,
  { readonly step: PresenceBuildStepId; readonly proves: string }
>;

export type ComputedProofSlotId = keyof typeof COMPUTED_PROOF_SLOTS;

export interface ClaimTimeFinding {
  readonly slot: ComputedProofSlotId;
  readonly title: string;
  readonly facts: readonly PresenceBuildFact[];
}

const ABSENT_VALUE =
  /^(?:0(?:\s|$)|no\s|none\b|not\s|n\/a$|unknown$|pending$|-+$)/iu;

/** A fact is proof only when it states a real, present, non-zero value. */
export function isAdmissibleComputedFact(fact: PresenceBuildFact): boolean {
  const value = fact.value.trim();
  return value.length > 0 && !ABSENT_VALUE.test(value);
}

const SLOT_BY_STEP = new Map<PresenceBuildStepId, ComputedProofSlotId>(
  (
    Object.entries(COMPUTED_PROOF_SLOTS) as [
      ComputedProofSlotId,
      (typeof COMPUTED_PROOF_SLOTS)[ComputedProofSlotId],
    ][]
  ).map(([slot, contract]) => [contract.step, slot])
);

/**
 * Findings in presence-build step order. Steps that are not completed, ran
 * empty, or hold no admissible fact contribute nothing.
 */
export function claimTimeProofFindings(
  steps: Partial<Record<PresenceBuildStepId, PresenceBuildStepState>>
): readonly ClaimTimeFinding[] {
  return PRESENCE_BUILD_STEPS.flatMap(stepId => {
    const slot = SLOT_BY_STEP.get(stepId);
    const state = steps[stepId];
    if (!slot || state?.status !== 'completed' || !state.artifact) return [];
    if (state.artifact.empty) return [];
    const facts = state.artifact.facts.filter(isAdmissibleComputedFact);
    if (facts.length === 0) return [];
    return [{ slot, title: state.artifact.title, facts }];
  });
}

/** The findings for one slot, or null so the slot hides. */
export function resolveComputedProofSlot(
  slot: ComputedProofSlotId,
  steps: Partial<Record<PresenceBuildStepId, PresenceBuildStepState>>
): ClaimTimeFinding | null {
  return (
    claimTimeProofFindings(steps).find(finding => finding.slot === slot) ?? null
  );
}
