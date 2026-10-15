import {
  DESIGN_TASTE_JURY_CRITERIA,
  type DesignTasteCapturePlan,
  type DesignTasteJuryCriterion,
} from './types';

export const DESIGN_TASTE_JURY_RUBRIC = {
  'optical-alignment': {
    name: 'Optical alignment',
    description:
      'Check perceived centering of icons and labels, text baselines, and balanced whitespace. Flag pairings that look off-center or misaligned even when their bounding boxes align; compare the changed surface at the supplied viewport sizes.',
  },
  'shadow-depth': {
    name: 'Shadow depth',
    description:
      'Check elevation hierarchy: shadows should clarify which surfaces float above others, with consistent softness and contrast in the supplied light and dark themes. Flag muddy, clipped, overpowering, or flattened depth; prefer borders or tonal separation for flat surfaces.',
  },
  'stagger-animation': {
    name: 'Stagger and animation quality',
    description:
      'Check stagger order and rhythm, duration and easing, interruptibility, and reduced-motion behavior using temporal evidence. Motion should explain state, keep controls usable throughout, and preserve unrelated layout; flag distracting cascades, abrupt jumps, sluggish feedback, or motion that delays interaction.',
  },
} as const satisfies Record<
  DesignTasteJuryCriterion,
  { readonly name: string; readonly description: string }
>;

/** Builds review instructions for real jurors; never generates verdicts. */
export function buildDesignTasteJuryPrompt(
  capturePlan: DesignTasteCapturePlan
): string | null {
  if (capturePlan.isNonUiPush || capturePlan.capture.length === 0) {
    return null;
  }

  return [
    'Review only the affected screenshot scenarios below. Compare supplied before/after captures and describe concrete regressions attributable to the change.',
    ...capturePlan.capture.map(entry => `- ${entry.scenarioId}`),
    '',
    'UI-feel checklist:',
    ...DESIGN_TASTE_JURY_CRITERIA.map(criterion => {
      const check = DESIGN_TASTE_JURY_RUBRIC[criterion];
      return `- ${criterion}: ${check.name}. ${check.description}`;
    }),
    '',
    'Do not infer timing or smoothness from still screenshots. For stagger-animation, require a recording or timestamped frame sequence; reduced-motion judgments also require reduced-motion evidence. When evidence is missing, mark the criterion not assessable in review notes and omit unsupported findings.',
    'Return only observed findings with id, summary, disposition, rank, objective, and criteria (an array of the applicable checklist IDs). Cite the scenario, state, and visible or temporal evidence in each summary. Use an empty findings array when no defect is supported.',
    'These UI-feel judgments default to disposition: taste and objective: false. Use ship/objective only when concrete evidence establishes a reproducible defect; criterion tags alone do not determine disposition.',
  ].join('\n');
}
