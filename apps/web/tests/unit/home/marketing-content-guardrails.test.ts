import { describe, expect, it } from 'vitest';
import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

describe('Marketing content guardrails', () => {
  describe('homepage release mocks', () => {
    it('presave mock artist includes the founder', () => {
      expect(HOME_RELEASE_DESTINATION_PRESAVE_MOCK.artist).toContain(
        'Tim White'
      );
    });

    it('presave mock release date is not a far-future placeholder', () => {
      const label = HOME_RELEASE_DESTINATION_PRESAVE_MOCK.releaseLabel;
      expect(label).not.toContain('2099');
      expect(label).not.toContain('2098');
      expect(label).not.toContain('2097');
    });

    it('live mock has a real past release date', () => {
      expect(HOME_RELEASE_DESTINATION_LIVE_MOCK.releaseLabel).toMatch(
        /Released/
      );
    });
  });

  describe('demo persona artwork', () => {
    it('does not use generic Unsplash images for release artwork', () => {
      for (const release of INTERNAL_DJ_DEMO_PERSONA.releases) {
        expect(release.artworkUrl).not.toContain('unsplash.com');
      }
    });

    it('does not use generic stock photo URLs for release artwork', () => {
      for (const release of INTERNAL_DJ_DEMO_PERSONA.releases) {
        expect(release.artworkUrl).not.toMatch(
          /unsplash|pexels|shutterstock|istock|gettyimages/i
        );
      }
    });
  });
});
