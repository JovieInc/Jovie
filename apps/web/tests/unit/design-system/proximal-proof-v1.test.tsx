// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The 2026-10-16 artist launch uses the real claim control and jov.ie/you
// identity primitive as product proof. It must stay proximal to the claim,
// preserve the actual /start handoff, and never imply that the visitor owns
// a founder/customer specimen or that a paid benefit has been certified.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';

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
  it('renders the proof inside the same section container as the identity claim it supports', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const claim = screen.getByRole('heading', { level: 1 });
    const proof = screen.getByTestId('homepage-hero-identity');

    // Proximal: the proof lives in the same hero section as the claim,
    // reachable with zero navigation and zero scroll-to-a-different section —
    // not merely "somewhere on this page".
    expect(hero.contains(claim)).toBe(true);
    expect(hero.contains(proof)).toBe(true);
    expect(within(proof).getByText('jov.ie/', { exact: false })).toBeTruthy();

    // Always visible with the claim — proximal proof is not gated behind a
    // hover/drill-down interaction (that would be progressive-depth, a
    // different rule, and would defeat "proximal").
    expect(proof).not.toHaveAttribute('hidden');
  });

  it('binds the identity primitive to the real claim handoff without claiming a customer identity', () => {
    render(<HomepageIdentityHero />);
    const proof = screen.getByTestId('homepage-hero-identity');
    const { claim, preview } = HOMEPAGE_IDENTITY_COPY.hero;
    const form = screen.getByTestId('homepage-claim-form');

    expect(preview.name).toBe(claim.placeholder);
    expect(proof).toHaveTextContent(`${claim.domain}${claim.placeholder}`);
    expect(form).toHaveAttribute('action', '/start');
    expect(within(form).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      preview.name
    );
    expect(within(proof).queryByRole('img')).toBeNull();
    expect(proof).not.toHaveTextContent(/Tim White|Founder|Claimed|Verified/i);
    expect(screen.queryByTestId('homepage-profile-specimen')).toBeNull();
    expect(screen.queryByText(/Avery|Fieldnotes|Illustrative/)).toBeNull();
  });
});
