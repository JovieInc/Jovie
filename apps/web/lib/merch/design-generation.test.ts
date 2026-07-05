import { describe, expect, it } from 'vitest';
import { selectionCountsToWeights } from './design-generation';

describe('selectionCountsToWeights', () => {
  it('is empty (equal weighting) with no selection history', () => {
    expect(selectionCountsToWeights([])).toEqual({});
  });

  it('Laplace-smooths: weight = 1 + picks', () => {
    expect(
      selectionCountsToWeights([
        { modelKey: 'gpt-image-1.5', count: 4 },
        { modelKey: 'recraft-v3', count: 1 },
      ])
    ).toEqual({ 'gpt-image-1.5': 5, 'recraft-v3': 2 });
  });

  it('skips rows with no recorded model (legacy designs)', () => {
    expect(
      selectionCountsToWeights([
        { modelKey: null, count: 9 },
        { modelKey: 'recraft-v3', count: 2 },
      ])
    ).toEqual({ 'recraft-v3': 3 });
  });

  it('never produces a zero/negative weight that could lock a model out', () => {
    const w = selectionCountsToWeights([
      { modelKey: 'gpt-image-1.5', count: 0 },
      { modelKey: 'recraft-v3', count: -3 },
    ]);
    for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(1);
  });
});
