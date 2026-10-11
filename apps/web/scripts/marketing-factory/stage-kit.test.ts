import { describe, expect, it } from 'vitest';
import { type DirectionRecord, pickDirection } from './stage-kit';

const direction = (
  index: number,
  passed: boolean,
  score: number
): DirectionRecord => ({
  direction: index,
  outputDigest: `sha256:${index}`,
  passed,
  score,
  invariantsFailed: passed ? [] : ['copy-no-em-dash'],
  evaluators: [],
});

describe('pickDirection', () => {
  it('picks the highest-scoring passing direction over a higher failing one', () => {
    const winner = pickDirection([
      direction(1, false, 0.95),
      direction(2, true, 0.7),
      direction(3, true, 0.8),
    ]);

    expect(winner.direction).toBe(3);
    expect(winner.rationale).toMatch(/direction 3 passed .* 0\.80/);
    expect(winner.rationale).toMatch(/highest of 2 passing/);
    expect(winner.rationale).toMatch(/1 \(failed, 0\.95\)/);
  });

  it('refines the best failing direction when none passed', () => {
    const winner = pickDirection([
      direction(1, false, 0.4),
      direction(2, false, 0.6),
    ]);

    expect(winner.direction).toBe(2);
    expect(winner.rationale).toMatch(/none passed/);
  });
});
