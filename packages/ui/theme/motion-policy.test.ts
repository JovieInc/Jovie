import { expect, it } from 'vitest';
import {
  type AttentionMotionProposal,
  DOMINANT_DELIGHT_INTENTIONALITY_FIELDS,
  type DominantDelightProposal,
  evaluateAttentionMotion,
  evaluateDominantDelights,
  getMaxDominantDelights,
  MOTION_POLICY,
  ATTENTION_MOTION_TERMINATION_EVENTS as stops,
} from './motion-policy';

const motion = (value: Partial<AttentionMotionProposal>) =>
  evaluateAttentionMotion({
    purpose: 'respond-to-user-input',
    starts_on: 'explicit-user-action',
    reduced_motion_fallback: true,
    stops_on: stops,
    ...value,
  });

it('enforces user-owned attention with deliberate-red cases', () => {
  expect(MOTION_POLICY.initial_state).toEqual({
    motion: 'still',
    audio: 'silent',
  });
  const rejected: [Partial<AttentionMotionProposal>, RegExp][] = [
    [
      { media_kind: 'audio', audible: true, autoplay: true, starts_on: 'load' },
      /autoplay-audio/,
    ],
    [
      { ambient_hero_background: true, continuously_moving_logo_bar: true },
      /ambient-hero.*moving-logo/,
    ],
    [{ starts_on: 'load', media_kind: 'video', muted: true }, /unguarded/],
    [
      { starts_on: 'scroll', purpose: 'bounded-editorial-treatment' },
      /orientation/,
    ],
  ];
  for (const [proposal, error] of rejected)
    expect(motion(proposal).errors.join()).toMatch(error);
  expect(motion({ media_kind: 'audio', audible: true }).passes).toBe(true);
  expect(
    motion({
      purpose: 'bounded-editorial-treatment',
      starts_on: 'load',
      media_kind: 'video',
      autoplay: true,
      muted: true,
      presentation_context: 'editorial-media-card',
      visibility_aware_pause: true,
      bounded_loop_or_completion: true,
      resource_performance_budget: true,
    }).passes
  ).toBe(true);
});

const earned = Object.fromEntries(
  DOMINANT_DELIGHT_INTENTIONALITY_FIELDS.map(field => [field, 'receipt'])
) as DominantDelightProposal;

it('preserves dominant-delight ceilings and receipts', () => {
  expect(getMaxDominantDelights(11, true)).toBe(3);
  const base = {
    content_section_count: 11,
    proposals: [earned, earned, earned],
  };
  expect(evaluateDominantDelights(base).passes).toBe(false);
  expect(
    evaluateDominantDelights({
      ...base,
      named_exception: 'Close',
      complete_motion_receipts: true,
    }).passes
  ).toBe(true);
  expect(
    evaluateDominantDelights({
      content_section_count: 6,
      proposals: [{ ...earned, decorative_novelty_only: true }],
      simultaneous_active_count: 2,
    }).passes
  ).toBe(false);
});
