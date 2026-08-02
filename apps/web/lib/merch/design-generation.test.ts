import { describe, expect, it, vi } from 'vitest';
import {
  buildMerchImagePrompt,
  MERCH_DESIGN_STRATEGIES,
  resolveMerchGenerationPrerequisites,
  selectionCountsToWeights,
  selectMerchDesignStrategies,
} from './design-generation';

const source = {
  sourceType: 'song_title' as const,
  sourceText: 'Static Bloom',
  provenanceTitle: 'Static Bloom',
  rightsStatus: 'owned' as const,
};

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

describe('merch design strategies', () => {
  it('keeps every strategy axis distinct rather than varying only adjectives', () => {
    const firstThree = MERCH_DESIGN_STRATEGIES.slice(0, 3);
    for (const field of [
      'composition',
      'typographyRole',
      'motifSystem',
      'palette',
      'density',
    ] as const) {
      expect(new Set(firstThree.map(strategy => strategy[field])).size).toBe(
        firstThree.length
      );
    }
  });

  it('builds pairwise-distinct source-grounded prompt contracts', () => {
    const prompts = MERCH_DESIGN_STRATEGIES.slice(0, 3).map(strategy =>
      buildMerchImagePrompt(
        'Tim White',
        'make something for the next release',
        strategy,
        source
      )
    );

    expect(new Set(prompts).size).toBe(3);
    for (const prompt of prompts) {
      expect(prompt).toContain('"Static Bloom"');
      expect(prompt).toContain('Provenance: Static Bloom');
      expect(prompt).toContain('Do not depict people, faces, portraits');
      expect(prompt).toContain('Do not recreate logos, trademarks, lyrics');
    }
  });

  it('does not surface a recently selected strategy when fresh alternatives exist', () => {
    const strategies = selectMerchDesignStrategies(3, ['Signal Field']);
    expect(strategies).toHaveLength(3);
    expect(strategies.map(strategy => strategy.label)).not.toContain(
      'Signal Field'
    );
  });
});
