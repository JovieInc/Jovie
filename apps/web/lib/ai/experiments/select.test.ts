import { describe, expect, it } from 'vitest';
import { selectExperimentModel, validateCandidates } from './select';

const A = 'anthropic/claude-sonnet-4-20250514';
const B = 'anthropic/claude-haiku-4-5-20251001';

describe('selectExperimentModel', () => {
  it('is deterministic for the same seed', () => {
    const candidates = [
      { model: A, weight: 50 },
      { model: B, weight: 50 },
    ];
    const first = selectExperimentModel(candidates, 'user-123');
    for (let i = 0; i < 20; i++) {
      expect(selectExperimentModel(candidates, 'user-123')).toBe(first);
    }
  });

  it('splits traffic roughly by weight', () => {
    const candidates = [
      { model: A, weight: 80 },
      { model: B, weight: 20 },
    ];
    let bCount = 0;
    const total = 5000;
    for (let i = 0; i < total; i++) {
      if (selectExperimentModel(candidates, `seed-${i}`) === B) bCount++;
    }
    const bShare = bCount / total;
    // ~20% split with generous tolerance for hash distribution noise.
    expect(bShare).toBeGreaterThan(0.15);
    expect(bShare).toBeLessThan(0.25);
  });

  it('returns the only positive-weight arm', () => {
    expect(
      selectExperimentModel(
        [
          { model: A, weight: 0 },
          { model: B, weight: 1 },
        ],
        'x'
      )
    ).toBe(B);
  });

  it('serves control when all weights are zero', () => {
    expect(
      selectExperimentModel(
        [
          { model: A, weight: 0 },
          { model: B, weight: 0 },
        ],
        'x'
      )
    ).toBe(A);
  });

  it('throws on empty candidates', () => {
    expect(() => selectExperimentModel([], 'x')).toThrow(RangeError);
  });
});

describe('validateCandidates', () => {
  it('accepts a valid 2-arm split', () => {
    expect(
      validateCandidates([
        { model: A, weight: 80 },
        { model: B, weight: 20 },
      ])
    ).toBeNull();
  });

  it('rejects fewer than 2 arms', () => {
    expect(validateCandidates([{ model: A, weight: 1 }])).toMatch(/at least 2/);
  });

  it('rejects duplicate models', () => {
    expect(
      validateCandidates([
        { model: A, weight: 1 },
        { model: A, weight: 1 },
      ])
    ).toMatch(/unique/);
  });

  it('rejects negative weights', () => {
    expect(
      validateCandidates([
        { model: A, weight: -1 },
        { model: B, weight: 1 },
      ])
    ).toMatch(/non-negative/);
  });

  it('rejects all-zero weights', () => {
    expect(
      validateCandidates([
        { model: A, weight: 0 },
        { model: B, weight: 0 },
      ])
    ).toMatch(/positive weight/);
  });
});
