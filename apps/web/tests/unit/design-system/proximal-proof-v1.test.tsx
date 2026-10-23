// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The shipped homepage hero keeps the jov.ie/ claim and the founder's live
// profile capture in the same section. The handoff stays /start. The capture
// is labeled as that real profile rather than implying the visitor owns it.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageArtistHero } from '@/components/homepage/HomepageArtistProfile';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';

vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('@/lib/flags/marketing-static', () => ({
  FEATURE_FLAGS: { WAITLIST_ENABLED: true },
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

describe('JOV-INV-038 proximal-proof evaluator (homepage hero)', () => {
  it('renders the proof inside the same section container as the claim it supports', () => {
    render(<HomepageArtistHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const claim = screen.getByRole('heading', { level: 1 });
    const form = within(hero).getByTestId('homepage-claim-form');
    const proof = within(hero).getByRole('img', {
      name: HOMEPAGE_COPY.hero.profile.alt,
    });

    expect(hero.contains(claim)).toBe(true);
    expect(hero.contains(form)).toBe(true);
    expect(proof).toHaveAttribute(
      'src',
      getMarketingExportImage(HOMEPAGE_COPY.hero.profile.scenarioId).publicUrl
    );
    expect(proof).not.toHaveAttribute('hidden');
    expect(proof).toHaveAttribute('data-priority', 'true');
  });

  it('binds the claim to /start and labels whose profile it is', () => {
    render(<HomepageArtistHero />);
    const { claim, profile } = HOMEPAGE_COPY.hero;
    const form = screen.getByTestId('homepage-claim-form');
    const proof = screen.getByRole('img', { name: profile.alt });

    expect(form).toHaveAttribute('action', '/start');
    expect(within(form).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      claim.placeholder
    );
    expect(proof).toHaveAttribute('alt', profile.alt);
    expect(profile.alt).toMatch(/Tim White's Jovie artist profile/);
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
