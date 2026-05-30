import { describe, expect, it } from 'vitest';
import {
  analyzeDesignConcept,
  buildGenerationOptions,
  canFulfillMerch,
} from './merch-generator';

describe('analyzeDesignConcept', () => {
  it('returns T-Shirt as default category', () => {
    const result = analyzeDesignConcept('tour merchandise');
    expect(result.suggestedProductCategory).toBe('T-Shirt');
    expect(result.suggestedColorway).toBe('Black');
    expect(result.reasoning.toLowerCase()).toContain('premium t-shirt');
  });

  it('detects hoodie requests', () => {
    const result = analyzeDesignConcept('heavy hoodie for winter tour');
    expect(result.suggestedProductCategory).toBe('Hoodie');
    expect(result.suggestedColorway).toBe('Black');
  });

  it('detects hat requests', () => {
    const result = analyzeDesignConcept('trucker cap');
    expect(result.suggestedProductCategory).toBe('Hat');
  });

  it('detects tank top requests', () => {
    const result = analyzeDesignConcept('summer tank top');
    expect(result.suggestedProductCategory).toBe('Tank Top');
  });

  it('uses itemType parameter when provided', () => {
    const result = analyzeDesignConcept('summer merch', 'hoodie');
    expect(result.suggestedProductCategory).toBe('Hoodie');
  });
});

describe('buildGenerationOptions', () => {
  const baseParams = {
    artistName: 'Test Artist',
    concept: {
      suggestedProductCategory: 'T-Shirt',
      suggestedColorway: 'Black',
      reasoning: 'Test reasoning.',
    },
    prompt: 'Tour merch',
    genres: ['indie rock'],
    location: 'Los Angeles',
  };

  it('generates three options', () => {
    const options = buildGenerationOptions(baseParams);
    expect(options).toHaveLength(3);
  });

  it('assigns correct lanes to each option', () => {
    const options = buildGenerationOptions(baseParams);
    expect(options[0].lane).toBe('band_tour_uniform');
    expect(options[1].lane).toBe('fashion_graphic_item');
    expect(options[2].lane).toBe('artist_world_artifact');
  });

  it('names options with the product suffix for Tees', () => {
    const options = buildGenerationOptions(baseParams);
    expect(options[0].designName).toContain('Signal Tee');
    expect(options[1].designName).toContain('Object Tee');
    expect(options[2].designName).toContain('Archive Tee');
  });

  it('names options with the product category for non-Tees', () => {
    const hoodieParams = {
      ...baseParams,
      concept: {
        ...baseParams.concept,
        suggestedProductCategory: 'Hoodie',
      },
    };
    const options = buildGenerationOptions(hoodieParams);
    expect(options[0].designName).toContain('Signal Hoodie');
    expect(options[1].designName).toContain('Object Hoodie');
    expect(options[2].designName).toContain('Archive Hoodie');
  });

  it('includes artist name in all option names', () => {
    const options = buildGenerationOptions(baseParams);
    for (const option of options) {
      expect(option.designName).toContain('Test Artist');
    }
  });

  it('has distinct retail prices per option', () => {
    const options = buildGenerationOptions(baseParams);
    expect(options[0].retailPriceCents).toBe(3999);
    expect(options[1].retailPriceCents).toBe(3499);
    expect(options[2].retailPriceCents).toBe(4499);
  });
});

describe('canFulfillMerch', () => {
  it('returns true (mock data always available)', () => {
    expect(canFulfillMerch()).toBe(true);
  });
});
