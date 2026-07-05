import { describe, expect, it, vi } from 'vitest';

const generateImage = vi.fn();
vi.mock('ai', () => ({
  generateImage: (args: unknown) => generateImage(args),
}));
vi.mock('@ai-sdk/gateway', () => ({
  gateway: { image: (id: string) => ({ __model: id }) },
}));

import {
  alphaProviderOptions,
  generatePrintGraphic,
  MERCH_IMAGE_MODELS,
  selectMerchImageModel,
  weightedPick,
} from './graphic-engine';

describe('alphaProviderOptions', () => {
  it('maps each native provider to its transparent option', () => {
    expect(
      alphaProviderOptions({
        id: 'openai/gpt-image-1.5',
        key: 'gpt-image-1.5',
        alpha: 'native',
        enabled: true,
      })
    ).toEqual({ openai: { background: 'transparent' } });
    expect(
      alphaProviderOptions({
        id: 'recraft/recraft-v3',
        key: 'recraft-v3',
        alpha: 'native',
        enabled: true,
      })
    ).toEqual({ recraft: { response_format: 'png' } });
    expect(
      alphaProviderOptions({
        id: 'bfl/flux-2-pro',
        key: 'flux-2-pro',
        alpha: 'knockout',
        enabled: false,
      })
    ).toBeUndefined();
  });

  it('has at least two enabled native-alpha models for a real A/B', () => {
    const enabledNative = MERCH_IMAGE_MODELS.filter(
      m => m.enabled && m.alpha === 'native'
    );
    expect(enabledNative.length).toBeGreaterThanOrEqual(2);
    for (const m of enabledNative) {
      expect(alphaProviderOptions(m)).toBeDefined();
    }
  });
});

describe('weightedPick', () => {
  const models = [{ key: 'a' }, { key: 'b' }, { key: 'c' }] as const;

  it('picks the bucket the roll lands in (equal weights)', () => {
    // total = 3; rand 0 → first, ~0.5 → middle, ~0.99 → last
    expect(weightedPick(models, undefined, () => 0).key).toBe('a');
    expect(weightedPick(models, undefined, () => 0.5).key).toBe('b');
    expect(weightedPick(models, undefined, () => 0.99).key).toBe('c');
  });

  it('biases toward the higher-weighted model', () => {
    const weights = { a: 0.1, b: 0.1, c: 10 };
    // total ≈ 10.2; almost the entire range belongs to c
    expect(weightedPick(models, weights, () => 0.5).key).toBe('c');
  });

  it('keeps a zero-feedback model in rotation via the floor', () => {
    const weights = { a: 0, b: 0, c: 0 };
    // floor makes all equal again → roll 0 returns the first, never throws
    expect(weightedPick(models, weights, () => 0).key).toBe('a');
  });

  it('throws on an empty pool', () => {
    expect(() => weightedPick([], undefined, () => 0)).toThrow();
  });
});

describe('selectMerchImageModel', () => {
  it('only ever returns enabled roster models', () => {
    const enabledKeys = new Set(
      MERCH_IMAGE_MODELS.filter(m => m.enabled).map(m => m.key)
    );
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(
        enabledKeys.has(selectMerchImageModel({ rand: () => r }).key)
      ).toBe(true);
    }
  });
});

describe('generatePrintGraphic', () => {
  it('requests a transparent background for native-alpha models and returns the bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    generateImage.mockResolvedValueOnce({ images: [{ uint8Array: bytes }] });

    const native = MERCH_IMAGE_MODELS.find(m => m.alpha === 'native');
    if (!native) throw new Error('expected a native-alpha model in the roster');

    const out = await generatePrintGraphic({
      prompt: 'panda surf',
      model: native,
    });

    const callArg = generateImage.mock.calls[0][0] as {
      model: { __model: string };
      prompt: string;
      providerOptions?: { openai?: { background?: string } };
    };
    expect(callArg.model.__model).toBe(native.id);
    expect(callArg.providerOptions?.openai?.background).toBe('transparent');
    expect(callArg.prompt).toContain('transparent');
    expect(out.modelKey).toBe(native.key);
    expect(out.mediaType).toBe('image/png');
    expect(out.image.equals(Buffer.from(bytes))).toBe(true);
  });

  it('throws rather than emit a non-alpha graphic for knockout models', async () => {
    generateImage.mockResolvedValueOnce({
      images: [{ uint8Array: new Uint8Array([9]) }],
    });
    const knockout = MERCH_IMAGE_MODELS.find(m => m.alpha === 'knockout');
    if (!knockout) throw new Error('expected a knockout model in the roster');

    await expect(
      generatePrintGraphic({ prompt: 'x', model: knockout })
    ).rejects.toThrow(/knockoutBackground/);
  });
});
