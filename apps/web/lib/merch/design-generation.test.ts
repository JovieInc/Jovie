import { describe, expect, it, vi } from 'vitest';
import {
  resolveMerchGenerationPrerequisites,
  selectionCountsToWeights,
} from './design-generation';

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
    const weights = selectionCountsToWeights([
      { modelKey: 'gpt-image-1.5', count: 0 },
      { modelKey: 'recraft-v3', count: -3 },
    ]);
    for (const weight of Object.values(weights)) {
      expect(weight).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('resolveMerchGenerationPrerequisites', () => {
  it('starts independent reads together before any one resolves', async () => {
    let resolveArtist!: (value: string) => void;
    let resolveCatalog!: (value: string) => void;
    let resolveWeights!: (value: string) => void;
    const artistName = vi.fn(
      () => new Promise<string>(resolve => (resolveArtist = resolve))
    );
    const catalog = vi.fn(
      () => new Promise<string>(resolve => (resolveCatalog = resolve))
    );
    const modelWeights = vi.fn(
      () => new Promise<string>(resolve => (resolveWeights = resolve))
    );

    const result = resolveMerchGenerationPrerequisites({
      artistName,
      catalog,
      modelWeights,
    });

    expect(artistName).toHaveBeenCalledOnce();
    expect(catalog).toHaveBeenCalledOnce();
    expect(modelWeights).toHaveBeenCalledOnce();

    resolveCatalog('catalog');
    resolveWeights('weights');
    resolveArtist('artist');

    await expect(result).resolves.toEqual({
      artistName: 'artist',
      catalog: 'catalog',
      modelWeights: 'weights',
    });
  });
});
