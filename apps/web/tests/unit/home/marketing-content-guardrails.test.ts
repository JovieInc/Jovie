import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';
import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

vi.mock('@/features/home/HomeAdaptiveProfileStory', () => ({
  HomeAdaptiveProfileStory: () =>
    createElement(
      'div',
      undefined,
      createElement('section', undefined, 'Built for artists'),
      createElement('section', undefined, 'Trust the profile you share')
    ),
}));

vi.mock('@/features/home/HomeEngageBentoSection', () => ({
  HomeEngageBentoSection: () =>
    createElement(
      'section',
      undefined,
      createElement('h2', undefined, 'Engage.'),
      createElement('p', undefined, 'Smart links that stay current.')
    ),
}));

vi.mock('@/features/home/HomeAutoNotifySection', () => ({
  HomeAutoNotifySection: () =>
    createElement(
      'section',
      undefined,
      createElement('h2', undefined, 'Notify every fan. Automatically.')
    ),
}));

vi.mock('@/features/home/HomeFanRelationshipSection', () => ({
  HomeFanRelationshipSection: () =>
    createElement(
      'section',
      undefined,
      createElement('h2', undefined, 'Turn action into a relationship.'),
      createElement('p', undefined, 'Recognize the people who care.')
    ),
}));

vi.mock('@/features/home/HomeLiveProofSection', () => ({
  HomeLiveProofSection: () => createElement('section', undefined, 'Live proof'),
}));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();

  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    })),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});

vi.mock('@/lib/feature-flags/shared', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/feature-flags/shared')>();
  return {
    ...actual,
    FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, SHOW_HOMEPAGE_SECTIONS: true },
  };
});

describe('Marketing content guardrails', () => {
  const originalMatchMedia = globalThis.matchMedia;

  beforeAll(() => {
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
    it('keeps banned jargon and weak framing off the homepage narrative', () => {
      const { container } = render(createElement(HomePageNarrative));
      const text = container.textContent?.toLowerCase() ?? '';

      expect(text).not.toContain('command center');
      expect(text).not.toContain('all-in-one');
      expect(text).not.toContain('workflow');
      expect(text).not.toContain('creator career');
      expect(text).not.toContain('release moment');
      expect(text).not.toContain('campaign build');
      expect(text).not.toContain('automatic switching');
      expect(text).not.toContain('should not require');
      expect(text).not.toContain('can become');
      expect(text).not.toContain('dsp order');
      expect(text).not.toContain('social order');
      expect(text).not.toContain('support connected');
      expect(text).not.toContain('support, and business');
      expect(text).not.toContain('keep the momentum going');
      expect(text).not.toContain("see who's paying attention");
      expect(text).not.toContain("see who's paying attention");
      expect(text).not.toContain('automatic by default');
      expect(text).not.toContain('location-aware by default');
    });

    it('includes the locked homepage copy', () => {
      const { container } = render(createElement(HomePageNarrative));
      const text = container.textContent ?? '';

      expect(text).toContain('Built for artists');
      expect(text).not.toContain('Built for artists by artists');
      expect(text).toContain('Notify every fan. Automatically.');
      expect(text).toContain('Engage.');
      expect(text).toContain('Turn action into a relationship.');
      expect(text).toContain('Stay in the studio.');
      expect(text).toContain('Smart links that stay current.');
      expect(text).toContain('Recognize the people who care.');
    });
  });
});
