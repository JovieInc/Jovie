/**
 * Canonical policy for dominant delight.
 *
 * Functional transitions explain state and are governed by shared duration /
 * easing tokens. A dominant delight intentionally attracts attention and must
 * pass the intentionality gate below. Every numeric value here is a ceiling,
 * never a prompt to add motion. Zero dominant delights is always valid.
 */
export const MOTION_PRESENTATION_TIERS = [
  'static',
  'editorial',
  'video',
] as const;

export type MotionPresentationTier = (typeof MOTION_PRESENTATION_TIERS)[number];

export const DOMINANT_DELIGHT_LIMITS = [
  { content_sections_max: 6, max_dominant_delights: 1 },
  { content_sections_max: 10, max_dominant_delights: 2 },
  {
    content_sections_max: null,
    max_dominant_delights: 3,
    requires_named_exception_and_complete_receipts: true,
  },
] as const;

export const DOMINANT_DELIGHT_INTENTIONALITY_FIELDS = [
  'exact_earned_moment',
  'user_outcome',
  'static_or_functional_insufficiency',
  'expected_material_improvement',
  'invasiveness_and_repetition_risk',
  'reduced_motion_and_static_behavior',
  'approved_archetype_or_exception',
] as const;

export const DOMINANT_DELIGHT_REJECTION_RULES = [
  'Decorative novelty is the only rationale.',
  'The effect competes with the user task.',
  'The effect repeats during routine use.',
  'The effect exists to consume available budget.',
  'The material benefit is uncertain.',
] as const;

export const MOTION_POLICY = {
  delight_optional: true,
  simultaneous_active_max: 1,
  simultaneous_scope: 'viewport',
  limits: DOMINANT_DELIGHT_LIMITS,
  section_counting: {
    definition: 'Count content-bearing sections only.',
    excluded: ['global header', 'global footer'],
    distinct_content_sections: ['proof strip', 'footer CTA'],
  },
  progression: MOTION_PRESENTATION_TIERS,
  default_tier: 'static',
  editorial_may_be_deferred: true,
  video_may_be_deferred: true,
  static_tier_may_ship_independently: true,
  intentionality_fields: DOMINANT_DELIGHT_INTENTIONALITY_FIELDS,
  reject_when: DOMINANT_DELIGHT_REJECTION_RULES,
  definitions: {
    functional_transition: 'explain state.',
    dominant_delight: 'intentionally attracts attention.',
  },
  safeguards: {
    reduced_motion_fallback: 'mandatory',
    static_fallback: 'mandatory',
    scroll_hijacking_allowed: false,
    parallax_regression_proof: 'mandatory',
  },
} as const;

export interface DominantDelightProposal {
  readonly exact_earned_moment: string;
  readonly user_outcome: string;
  readonly static_or_functional_insufficiency: string;
  readonly expected_material_improvement: string;
  readonly invasiveness_and_repetition_risk: string;
  readonly reduced_motion_and_static_behavior: string;
  readonly approved_archetype_or_exception: string;
  readonly decorative_novelty_only?: boolean;
  readonly competes_with_task?: boolean;
  readonly repeats_during_routine_use?: boolean;
  readonly exists_to_consume_available_budget?: boolean;
  readonly material_benefit_uncertain?: boolean;
}

export interface DominantDelightEvaluationInput {
  readonly content_section_count: number;
  readonly proposals: readonly DominantDelightProposal[];
  readonly simultaneous_active_count?: number;
  readonly named_exception?: string;
  readonly complete_motion_receipts?: boolean;
}

export interface DominantDelightEvaluation {
  readonly passes: boolean;
  readonly max_dominant_delights: number;
  readonly errors: readonly string[];
}

export function getMaxDominantDelights(
  contentSectionCount: number,
  hasExceptionReceipts = false
): number {
  if (contentSectionCount <= 0) return 0;
  if (contentSectionCount <= 6) return 1;
  if (contentSectionCount <= 10) return 2;
  return hasExceptionReceipts ? 3 : 2;
}

export function evaluateDominantDelights({
  content_section_count,
  proposals,
  simultaneous_active_count = 0,
  named_exception,
  complete_motion_receipts = false,
}: DominantDelightEvaluationInput): DominantDelightEvaluation {
  const errors: string[] = [];
  const hasExceptionReceipts = Boolean(
    named_exception?.trim() && complete_motion_receipts
  );
  const max_dominant_delights = getMaxDominantDelights(
    content_section_count,
    hasExceptionReceipts
  );

  if (!Number.isInteger(content_section_count) || content_section_count < 0) {
    errors.push('content_section_count must be a non-negative integer.');
  }
  if (proposals.length > max_dominant_delights) {
    errors.push(
      `Proposed ${proposals.length} dominant delights; this composition allows at most ${max_dominant_delights}.`
    );
  }
  if (simultaneous_active_count > MOTION_POLICY.simultaneous_active_max) {
    errors.push(
      `simultaneous_active_count must not exceed ${MOTION_POLICY.simultaneous_active_max}.`
    );
  }
  if (
    !Number.isInteger(simultaneous_active_count) ||
    simultaneous_active_count < 0
  ) {
    errors.push('simultaneous_active_count must be a non-negative integer.');
  }

  proposals.forEach((proposal, index) => {
    for (const field of DOMINANT_DELIGHT_INTENTIONALITY_FIELDS) {
      const value = proposal[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`Delight ${index + 1} is missing ${field}.`);
      }
    }
    if (proposal.decorative_novelty_only) {
      errors.push(`Delight ${index + 1} is decorative novelty only.`);
    }
    if (proposal.competes_with_task) {
      errors.push(`Delight ${index + 1} competes with the task.`);
    }
    if (proposal.repeats_during_routine_use) {
      errors.push(`Delight ${index + 1} repeats during routine use.`);
    }
    if (proposal.exists_to_consume_available_budget) {
      errors.push(`Delight ${index + 1} exists to consume available budget.`);
    }
    if (proposal.material_benefit_uncertain) {
      errors.push(`Delight ${index + 1} has uncertain material benefit.`);
    }
  });

  return { passes: errors.length === 0, max_dominant_delights, errors };
}
