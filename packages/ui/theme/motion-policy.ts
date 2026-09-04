export const MOTION_PRESENTATION_TIERS = [
  'static',
  'editorial',
  'video',
] as const;
export type MotionPresentationTier = (typeof MOTION_PRESENTATION_TIERS)[number];

export const ATTENTION_MOTION_PURPOSES = [
  'communicate-real-activity',
  'preserve-orientation',
  'improve-perceived-loading',
  'respond-to-user-input',
  'bounded-editorial-treatment',
] as const;
export type AttentionMotionPurpose = (typeof ATTENTION_MOTION_PURPOSES)[number];

export const ATTENTION_MOTION_TERMINATION_EVENTS = [
  'completion',
  'error',
  'cancellation',
  'backgrounding',
  'loss-of-transport',
  'leaving-viewport',
] as const;
export type AttentionMotionTerminationEvent =
  (typeof ATTENTION_MOTION_TERMINATION_EVENTS)[number];

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
  'decorative-only',
  'competes-with-task',
  'routine-repetition',
  'budget-filling',
  'uncertain-benefit',
] as const;

export const MOTION_POLICY = {
  attention_ownership: 'user',
  initial_state: { motion: 'still', audio: 'silent' },
  allowed_purposes: ATTENTION_MOTION_PURPOSES,
  delight_optional: true,
  simultaneous_active_max: 1,
  simultaneous_scope: 'viewport',
  limits: DOMINANT_DELIGHT_LIMITS,
  section_counting: {
    definition: 'content-bearing sections',
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
  safeguards: {
    reduced_motion_fallback: 'mandatory',
    static_fallback: 'mandatory',
    scroll_hijacking_allowed: false,
    parallax_regression_proof: 'mandatory',
  },
  muted_autoplay_video_exception: {
    contexts: ['editorial-media-card', 'feed'],
    requirements: [
      'muted',
      'visibility-aware-pause',
      'bounded-loop-or-completion',
      'reduced-motion-fallback',
      'resource-performance-budget',
    ],
  },
} as const;

export type AttentionMotionProposal = {
  purpose: AttentionMotionPurpose;
  starts_on: 'load' | 'explicit-user-action' | 'scroll' | 'system-state';
  media_kind?: 'none' | 'audio' | 'video';
  autoplay?: boolean;
  audible?: boolean;
  muted?: boolean;
  presentation_context?: 'standard' | 'editorial-media-card' | 'feed';
  ambient_hero_background?: boolean;
  continuously_moving_logo_bar?: boolean;
  visibility_aware_pause?: boolean;
  bounded_loop_or_completion?: boolean;
  reduced_motion_fallback?: boolean;
  resource_performance_budget?: boolean;
  stops_on?: readonly AttentionMotionTerminationEvent[];
};
export type AttentionMotionEvaluation = { passes: boolean; errors: string[] };

export function evaluateAttentionMotion(
  p: AttentionMotionProposal
): AttentionMotionEvaluation {
  const errors: string[] = [];
  const media = p.media_kind ?? 'none';
  const stops = new Set(p.stops_on);
  const video =
    media === 'video' &&
    p.muted &&
    ['editorial-media-card', 'feed'].includes(p.presentation_context ?? '') &&
    p.visibility_aware_pause &&
    p.bounded_loop_or_completion &&
    p.reduced_motion_fallback &&
    p.resource_performance_budget;
  if (p.ambient_hero_background) errors.push('ambient-hero');
  if (p.continuously_moving_logo_bar) errors.push('moving-logo-bar');
  if (p.autoplay && (media === 'audio' || p.audible))
    errors.push('autoplay-audio');
  if (
    (media === 'audio' || p.audible) &&
    p.starts_on !== 'explicit-user-action'
  )
    errors.push('audible-without-play');
  if ((p.starts_on === 'load' || p.autoplay) && !video)
    errors.push('unguarded-load-motion');
  if (!p.reduced_motion_fallback) errors.push('missing-reduced-motion');
  if (p.starts_on === 'scroll' && p.purpose !== 'preserve-orientation')
    errors.push('scroll-without-orientation');
  if (!stops.has('backgrounding')) errors.push('missing-background-stop');
  if (!stops.has('leaving-viewport')) errors.push('missing-viewport-stop');
  return { passes: errors.length === 0, errors };
}

export type DominantDelightProposal = Record<
  (typeof DOMINANT_DELIGHT_INTENTIONALITY_FIELDS)[number],
  string
> & {
  decorative_novelty_only?: boolean;
  competes_with_task?: boolean;
  repeats_during_routine_use?: boolean;
  exists_to_consume_available_budget?: boolean;
  material_benefit_uncertain?: boolean;
};
export type DominantDelightEvaluationInput = {
  content_section_count: number;
  proposals: readonly DominantDelightProposal[];
  simultaneous_active_count?: number;
  named_exception?: string;
  complete_motion_receipts?: boolean;
};
export type DominantDelightEvaluation = {
  passes: boolean;
  max_dominant_delights: number;
  errors: string[];
};

export function getMaxDominantDelights(
  sections: number,
  receipts = false
): number {
  if (sections <= 0) return 0;
  if (sections <= 6) return 1;
  if (sections <= 10) return 2;
  return receipts ? 3 : 2;
}

export function evaluateDominantDelights({
  content_section_count: sections,
  proposals,
  simultaneous_active_count: active = 0,
  named_exception,
  complete_motion_receipts = false,
}: DominantDelightEvaluationInput): DominantDelightEvaluation {
  const errors: string[] = [];
  const max_dominant_delights = getMaxDominantDelights(
    sections,
    Boolean(named_exception?.trim() && complete_motion_receipts)
  );
  if (!Number.isInteger(sections) || sections < 0)
    errors.push('invalid-section-count');
  if (proposals.length > max_dominant_delights)
    errors.push('delight-limit-exceeded');
  if (!Number.isInteger(active) || active < 0 || active > 1)
    errors.push('invalid-active-count');
  proposals.forEach((proposal, index) => {
    if (
      DOMINANT_DELIGHT_INTENTIONALITY_FIELDS.some(
        field => !proposal[field]?.trim()
      )
    )
      errors.push(`delight-${index + 1}-missing-intent`);
    if (
      proposal.decorative_novelty_only ||
      proposal.competes_with_task ||
      proposal.repeats_during_routine_use ||
      proposal.exists_to_consume_available_budget ||
      proposal.material_benefit_uncertain
    )
      errors.push(`delight-${index + 1}-rejected`);
  });
  return { passes: errors.length === 0, max_dominant_delights, errors };
}
