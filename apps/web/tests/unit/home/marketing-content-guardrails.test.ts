import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';
import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe('Marketing content guardrails', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalMatchMedia = globalThis.matchMedia;

  beforeAll(() => {
    // @ts-expect-error test shim
    globalThis.IntersectionObserver = MockIntersectionObserver;
    // @ts-expect-error test shim
    globalThis.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  afterAll(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    globalThis.matchMedia = originalMatchMedia;
  });

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

  describe('homepage copy guardrails', () => {
    it('keeps banned broad-framing language off the homepage narrative', () => {
      const { container } = render(createElement(HomePageNarrative));
      const text = container.textContent?.toLowerCase() ?? '';

      expect(text).not.toContain('platform');
      expect(text).not.toContain('command center');
      expect(text).not.toContain('all-in-one');
      expect(text).not.toContain('workflow');
      expect(text).not.toContain('creator career');
      expect(text).not.toContain('release moment');
      expect(text).not.toContain('generic funnel');
      expect(text).not.toContain('runs itself underneath');
      expect(text).not.toContain('artist-branded notifications');
      expect(text).not.toContain('crush every release');
      expect(text).not.toContain('more ways it works');
    });
  });
});
