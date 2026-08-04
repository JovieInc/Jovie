import { describe, expect, it } from 'vitest';
import {
  DOMINANT_DELIGHT_LIMITS,
  evaluateDominantDelights,
  getMaxDominantDelights,
  MOTION_POLICY,
} from './motion-policy';

const earnedProposal = {
  exact_earned_moment: 'The customer completes the release handoff.',
  user_outcome: 'Completion is unmistakable without delaying the next action.',
  static_or_functional_insufficiency:
    'The state change spans two surfaces and needs one bounded focal handoff.',
  expected_material_improvement: 'Fewer repeated submissions after completion.',
  invasiveness_and_repetition_risk:
    'Runs once on explicit completion and never during routine navigation.',
  reduced_motion_and_static_behavior:
    'Immediate final state with the same confirmation copy and focus target.',
  approved_archetype_or_exception: 'Approved completion archetype receipt.',
} as const;

describe('dominant delight policy', () => {
  it('treats every number as a ceiling and always accepts zero delight', () => {
    const result = evaluateDominantDelights({
      content_section_count: 14,
      proposals: [],
    });

    expect(MOTION_POLICY.delight_optional).toBe(true);
    expect(MOTION_POLICY.section_counting).toEqual({
      definition: 'Count content-bearing sections only.',
      excluded: ['global header', 'global footer'],
      distinct_content_sections: ['proof strip', 'footer CTA'],
    });
    expect(JSON.stringify(MOTION_POLICY)).not.toMatch(
      /required_count|minimum|target|coverage|utilization/
    );
    expect(result).toEqual({
      passes: true,
      max_dominant_delights: 2,
      errors: [],
    });
  });

  it('rejects budget filling even when the proposal is below the ceiling', () => {
    const result = evaluateDominantDelights({
      content_section_count: 6,
      proposals: [
        {
          ...earnedProposal,
          exists_to_consume_available_budget: true,
        },
      ],
    });

    expect(result.max_dominant_delights).toBe(1);
    expect(result.passes).toBe(false);
    expect(result.errors).toContain(
      'Delight 1 exists to consume available budget.'
    );
  });

  it('applies section ceilings and unlocks a third only with full receipts', () => {
    expect(DOMINANT_DELIGHT_LIMITS.at(-1)).toMatchObject({
      max_dominant_delights: 3,
      requires_named_exception_and_complete_receipts: true,
    });
    expect(getMaxDominantDelights(1)).toBe(1);
    expect(getMaxDominantDelights(6)).toBe(1);
    expect(getMaxDominantDelights(7)).toBe(2);
    expect(getMaxDominantDelights(10)).toBe(2);
    expect(getMaxDominantDelights(11)).toBe(2);
    expect(getMaxDominantDelights(11, true)).toBe(3);

    const withoutReceipts = evaluateDominantDelights({
      content_section_count: 11,
      proposals: [earnedProposal, earnedProposal, earnedProposal],
      named_exception: 'Campaign close',
      complete_motion_receipts: false,
    });
    const withReceipts = evaluateDominantDelights({
      content_section_count: 11,
      proposals: [earnedProposal, earnedProposal, earnedProposal],
      named_exception: 'Campaign close',
      complete_motion_receipts: true,
    });

    expect(withoutReceipts.passes).toBe(false);
    expect(withoutReceipts.max_dominant_delights).toBe(2);
    expect(withReceipts.passes).toBe(true);
    expect(withReceipts.max_dominant_delights).toBe(3);
  });

  it('allows only one attention-commanding delight active at once', () => {
    const result = evaluateDominantDelights({
      content_section_count: 8,
      proposals: [earnedProposal],
      simultaneous_active_count: 2,
    });

    expect(result.passes).toBe(false);
    expect(result.errors).toContain(
      'simultaneous_active_count must not exceed 1.'
    );
  });

  it('rejects decorative, task-competing, routine, or uncertain proposals', () => {
    const result = evaluateDominantDelights({
      content_section_count: 6,
      proposals: [
        {
          ...earnedProposal,
          decorative_novelty_only: true,
          competes_with_task: true,
          repeats_during_routine_use: true,
          material_benefit_uncertain: true,
        },
      ],
    });

    expect(result.passes).toBe(false);
    expect(result.errors.join(' ')).toMatch(
      /decorative novelty|competes with the task|routine use|uncertain material benefit/
    );
  });
});
