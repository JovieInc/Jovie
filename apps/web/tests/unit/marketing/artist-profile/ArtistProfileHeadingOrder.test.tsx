import { render } from '@testing-library/react';
import { run as axeRun } from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { ArtistProfileHeroAdaptiveIntro } from '@/components/marketing/artist-profile/ArtistProfileHeroAdaptiveIntro';
import { ArtistProfileOutcomesCarousel } from '@/components/marketing/artist-profile/ArtistProfileOutcomesCarousel';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
  usePathname: () => '/artist-profiles',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// The proof card is irrelevant to heading structure and its jsdom render is
// disproportionately heavy, so it is stubbed out.
vi.mock('@/features/profile/ProfilePrimaryActionCard', () => ({
  ProfilePrimaryActionCard: () => <div data-testid='ppac-stub' />,
}));

function renderHeroThroughOutcomes() {
  return render(
    <>
      <ArtistProfileHeroAdaptiveIntro
        hero={ARTIST_PROFILE_COPY.hero}
        adaptive={ARTIST_PROFILE_COPY.adaptive}
      />
      <ArtistProfileOutcomesCarousel outcomes={ARTIST_PROFILE_COPY.outcomes} />
    </>
  );
}

describe('artist-profiles heading order (JOV-2246)', () => {
  it('renders an h2 between the hero h1 and the outcome card h3s', () => {
    const { container } = renderHeroThroughOutcomes();

    const headings = Array.from(
      container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    );
    const levels = headings.map(h => Number(h.tagName.slice(1)));

    expect(levels[0]).toBe(1);
    // WCAG 1.3.1 / axe heading-order: levels may never increase by more
    // than one (no h1 → h3 skip between hero and outcomes carousel).
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
    expect(levels).toContain(2);
    expect(levels).toContain(3);
  });

  it('passes the axe heading-order rule', async () => {
    const { container } = renderHeroThroughOutcomes();

    const results = await axeRun(container, {
      runOnly: { type: 'rule', values: ['heading-order'] },
    });

    expect(results.violations).toEqual([]);
  });
});
