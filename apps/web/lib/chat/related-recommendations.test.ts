import { describe, expect, it } from 'vitest';
import {
  buildRelatedSuggestionsFraming,
  isMusicRecommendationSource,
  type RelatedRecommendationSource,
} from './related-recommendations';

function source(
  overrides: Partial<RelatedRecommendationSource> = {}
): RelatedRecommendationSource {
  return {
    genres: [],
    hasMusicLinks: false,
    spotifyPopularity: null,
    ...overrides,
  };
}

describe('isMusicRecommendationSource', () => {
  it('is false when the profile carries no music signals', () => {
    expect(isMusicRecommendationSource(source())).toBe(false);
  });

  it('is true when genres are synced', () => {
    expect(isMusicRecommendationSource(source({ genres: ['indie pop'] }))).toBe(
      true
    );
  });

  it('is true when DSP music links exist', () => {
    expect(isMusicRecommendationSource(source({ hasMusicLinks: true }))).toBe(
      true
    );
  });

  it('is true when a Spotify popularity score exists', () => {
    expect(isMusicRecommendationSource(source({ spotifyPopularity: 42 }))).toBe(
      true
    );
  });
});

describe('buildRelatedSuggestionsFraming', () => {
  it('uses music-similarity language for music sources', () => {
    const framing = buildRelatedSuggestionsFraming(
      source({ genres: ['ambient'], hasMusicLinks: true })
    );

    expect(framing.isMusicSource).toBe(true);
    expect(framing.subjectLabel).toBe('Related artists');
    expect(framing.subjectTerm).toBe('related artists');
    expect(framing.description).toContain('related artists');
    expect(framing.instructions).toContain('related artists');
    expect(framing.summary).toContain('artists');
  });

  it('uses Related creators framing for non-music sources', () => {
    const framing = buildRelatedSuggestionsFraming(source());

    expect(framing.isMusicSource).toBe(false);
    expect(framing.subjectLabel).toBe('Related creators');
    expect(framing.subjectTerm).toBe('related creators');
    expect(framing.description).toContain('related creators');
    expect(framing.instructions).toContain('related creators');
    expect(framing.summary).toContain('creators');
    expect(framing.instructions).not.toContain('artist');
    expect(framing.instructions).not.toContain('playlist');
  });
});
