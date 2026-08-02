import { describe, expect, it } from 'vitest';
import { buildMerchGenerationPrompt } from './generation-input';

describe('buildMerchGenerationPrompt', () => {
  it('uses the stated item type without adding a question step', () => {
    expect(
      buildMerchGenerationPrompt('Make a drop', 'hoodie', 'fallback')
    ).toEqual({
      prompt: 'Make a drop\nItem type: hoodie',
      usedDefaultItemType: false,
    });
  });

  it('transparently defaults to a premium tee when no item type is supplied', () => {
    expect(
      buildMerchGenerationPrompt('Make a drop', undefined, 'fallback')
    ).toEqual({
      prompt: 'Make a drop\nItem type: premium tee',
      usedDefaultItemType: true,
    });
  });
});
