// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageIdentityHero.tsx). Its current
// identity claim is supported by an explicitly illustrative claimed-page
// preview and the jov.ie/you form in the same hero, not by a generic
// testimonial or a product screenshot dropped elsewhere. This renders the
// real component tree and asserts that proximity and route specificity.
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

// A generic/mechanical preview would use placeholder copy instead of showing
// the exact jov.ie identity and claim action promised by this route.
const GENERIC_PROOF_LANGUAGE =
  /\b(?:lorem ipsum|placeholder|sample|example user|john doe|jane doe)\b/i;

describe('JOV-INV-038 proximal-proof evaluator (homepage hero)', () => {
  it('renders the proof inside the same section container as the identity claim it supports', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const claim = within(hero).getByRole('heading', { level: 1 });
    const proof = within(hero).getByTestId('homepage-claim-card');
    const claimForm = within(proof).getByTestId('homepage-claim-form');

    // Proximal: the preview and its claim action live in the same immediate
    // hero section as the promise, reachable with zero navigation and zero
    // scroll-to-a-different section.
    expect(hero.contains(claim)).toBe(true);
    expect(hero.contains(proof)).toBe(true);
    expect(proof.contains(claimForm)).toBe(true);

    // Always visible with the claim: proximal proof is not gated behind a
    // hover/drill-down interaction (that would be progressive-depth, a
    // different rule, and would defeat "proximal").
    expect(proof).not.toHaveAttribute('hidden');
  });

  it('shows an honest, route-specific claimed-page preview rather than generic proof', () => {
    const { claim, preview } = HOMEPAGE_IDENTITY_COPY.hero;
    expect(claim.domain).toBe('jov.ie/');
    expect(claim.placeholder).toBe('you');
    expect(preview.note).toBe('Illustrative profile · Ready to claim');
    expect(Object.values(preview).join(' ')).not.toMatch(
      GENERIC_PROOF_LANGUAGE
    );

    render(<HomepageIdentityHero />);
    const proof = screen.getByTestId('homepage-claim-card');
    const proofImage = within(proof).getByRole('img');
    const claimInput = within(proof).getByRole('textbox', {
      name: 'Choose Your Handle',
    });

    expect(within(proof).getAllByText(claim.domain)).toHaveLength(2);
    expect(within(proof).getByText(preview.handle)).toBeInTheDocument();
    expect(within(proof).getByText(preview.note)).toBeInTheDocument();
    expect(claimInput).toHaveAttribute('placeholder', claim.placeholder);
    expect(within(proof).getByRole('button')).toHaveTextContent(claim.action);
    expect(proofImage).toHaveAttribute('alt', preview.portraitAlt);
    expect(screen.queryByTestId('homepage-hero-real-profile')).toBeNull();
  });
});
