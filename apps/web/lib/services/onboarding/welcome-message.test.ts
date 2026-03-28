import { describe, expect, it } from 'vitest';
import { buildWelcomeMessage } from '@/lib/services/onboarding/welcome-message';

const BASE_PARAMS = {
  displayName: 'Test Artist',
  releaseCount: 5,
  trackCount: 20,
  dspCount: 2,
  socialCount: 3,
};

describe('buildWelcomeMessage', () => {
  describe('career highlights prompt', () => {
    it('includes career highlights prompt when careerHighlights is null', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: null,
      });
      expect(message).toContain('career highlights');
      expect(message).toContain('sharper pitches');
    });

    it('includes career highlights prompt when careerHighlights is empty string', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: '',
      });
      expect(message).toContain('career highlights');
    });

    it('includes career highlights prompt when careerHighlights is whitespace only', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: '   ',
      });
      expect(message).toContain('career highlights');
    });

    it('does NOT include career highlights prompt when careerHighlights has content', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: '500K+ monthly listeners on Spotify',
      });
      expect(message).not.toContain('career highlights');
      expect(message).not.toContain('sharper pitches');
    });
  });

  describe('basic message structure', () => {
    it('includes the artist display name', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: null,
      });
      expect(message).toContain('Welcome to Jovie, Test Artist.');
    });

    it('falls back to "there" for empty display name', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        displayName: '',
        careerHighlights: null,
      });
      expect(message).toContain('Welcome to Jovie, there.');
    });

    it('shows track count when tracks exist', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: 'some highlights',
      });
      expect(message).toContain('20 tracks');
    });

    it('shows release count when no tracks', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        trackCount: 0,
        careerHighlights: 'some highlights',
      });
      expect(message).toContain('5 releases');
    });

    it('always ends with the call to action', () => {
      const message = buildWelcomeMessage({
        ...BASE_PARAMS,
        careerHighlights: null,
      });
      expect(message).toContain('What would you like to work on first?');
    });
  });
});
