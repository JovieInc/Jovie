// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The artist-profile homepage (EVENT 2026-10-20) proves its claim with the
// real product: a registry capture of a live Jovie artist profile, in the
// same hero as the jov.ie/ claim. The proof must stay proximal, keep the
// actual /start handoff, and be labeled as the founder's real profile rather
// than implying the visitor already owns it.
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
    const form = screen.getByTestId('homepage-claim-form');
    const proof = within(hero).getByRole('img');

    // Proximal: the product proof lives in the same hero section as the
    // promise and the claim, with zero navigation or scroll to reach it.
    expect(hero.contains(claim)).toBe(true);
    expect(hero.contains(form)).toBe(true);
    expect(proof).toHaveAttribute(
      'src',
      getMarketingExportImage(HOMEPAGE_COPY.hero.profile.scenarioId).publicUrl
    );
    // Always visible with the claim; never gated behind hover or drill-down.
    expect(proof).not.toHaveAttribute('hidden');
    expect(proof).toHaveAttribute('data-priority', 'true');
  });

  it('binds the proof to the real claim handoff and labels whose profile it is', () => {
    render(<HomepageArtistHero />);
    const form = screen.getByTestId('homepage-claim-form');
    const proof = screen.getByRole('img');
    const { claim, profile } = HOMEPAGE_COPY.hero;

    expect(form).toHaveAttribute('action', '/start');
    expect(within(form).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      claim.placeholder
    );
    // The capture is a named, real profile, not a visitor or customer stand-in.
    expect(proof).toHaveAttribute('alt', profile.alt);
    expect(profile.alt).toMatch(/Tim White's Jovie artist profile/);
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
