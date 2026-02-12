import { describe, expect, it } from 'vitest';
import { ALL_SUGGESTIONS, DEFAULT_SUGGESTIONS } from '@/components/jovie/types';

describe('Jovie suggested prompts config', () => {
  it('prioritizes world-class bio writing as the first default suggestion', () => {
    expect(DEFAULT_SUGGESTIONS[0]?.label).toBe(
      'Write me a world-class artist bio'
    );
    expect(DEFAULT_SUGGESTIONS[0]?.prompt).toContain('Spotify and Apple Music');
  });

  it('keeps the world-class bio prompt in the full suggestion catalog', () => {
    expect(
      ALL_SUGGESTIONS.some(
        item => item.label === 'Write me a world-class artist bio'
      )
    ).toBe(true);
  });
});
