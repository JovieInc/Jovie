// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageIdentityHero.tsx). Its former doc
// comment names the contract this evaluator supersedes: "Tim White's real
// jov.ie/tim profile as first-party proof (JOV-6946)" rendered inside the
// same hero section as the identity claim — not a generic testimonial dropped
// in a separate, distant section. This renders the real component tree and
// asserts the proof sits in the same immediate DOM container as the claim it
// backs, and that the proof is a named, route-specific identity rather than
// a placeholder.
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

// A generic/mechanical preview would use placeholder or third-person
// marketing language instead of this route's exact claim identity.
const GENERIC_PROOF_LANGUAGE =
  /\b(?:lorem ipsum|placeholder|sample|example user|john doe|jane doe)\b/i;

describe('JOV-INV-038 proximal-proof evaluator (homepage hero)', () => {
  it('renders the proof inside the same section container as the identity claim it supports', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const inner = hero.closest('section');
    expect(inner, 'hero has one active-content container').not.toBeNull();

    const claim = screen.getByRole('heading', { level: 1 });
    const proof = screen.getByTestId('homepage-claim-card');

    // Proximal: the proof lives in the exact same immediate section as the
    // claim, reachable with zero navigation and zero scroll-to-a-different
    // section — not merely "somewhere on this page".
    expect(inner?.contains(claim)).toBe(true);
    expect(inner?.contains(proof)).toBe(true);
    expect(hero.contains(proof)).toBe(true);

    // Always visible with the claim — proximal proof is not gated behind a
    // hover/drill-down interaction (that would be progressive-depth, a
    // different rule, and would defeat "proximal").
    expect(proof).not.toHaveAttribute('hidden');
  });

  it('shows an honest, route-specific claimed-page preview rather than generic proof', () => {
    const { claim, preview } = HOMEPAGE_IDENTITY_COPY.hero;
    expect(`${claim.domain}${preview.handle}`).toBe('jov.ie/avery');
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
