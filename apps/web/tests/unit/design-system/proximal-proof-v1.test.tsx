// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// Representative surface: the canonical homepage hero
// (apps/web/components/homepage/HomepageIdentityHero.tsx). Tim 2026-09-28:
// the identity + link-claim hero proves its claim with Tim White's real
// claimed jov.ie/tim (JOV-6946) inside the same hero section as the identity
// claim, never an illustrative placeholder person. This renders the real component tree and
// asserts the proof sits in the same immediate DOM container as the claim it
// backs, and that the proof is a named, route-specific identity rather than
// a placeholder.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

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

// A generic/mechanical proof would use placeholder or third-person marketing
// language instead of naming a real, specific identity for this exact route.
const GENERIC_PROOF_LANGUAGE =
  /\b(?:lorem ipsum|placeholder|sample|example user|john doe|jane doe)\b/i;

describe('JOV-INV-038 proximal-proof evaluator (homepage hero)', () => {
  it('renders the proof inside the same section container as the identity claim it supports', () => {
    render(<HomepageIdentityHero />);

    const hero = screen.getByTestId('marketing-section-hero');
    const claim = screen.getByRole('heading', { level: 1 });
    const proof = screen.getByTestId('homepage-hero-real-profile');

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

  it('names a real, route-specific identity as proof rather than generic or placeholder proof', () => {
    const { proofAlt } = HOMEPAGE_IDENTITY_COPY.hero;
    // Founder-locked wording (JOV-6946): regressing this silently swaps real
    // first-party proof for something generic, so it is pinned exactly like
    // the other homepage taste locks in scanTasteLocks.
    expect(proofAlt).toBe('Tim White’s Jovie profile at jov.ie/tim');
    expect(proofAlt).not.toMatch(GENERIC_PROOF_LANGUAGE);
    expect(proofAlt).toContain('jov.ie/tim');

    render(<HomepageIdentityHero />);
    const proof = screen.getByTestId('homepage-hero-real-profile');
    const proofImage = within(proof).getByRole('img');

    expect(proofImage).toHaveAttribute('src', TIM_WHITE_PROFILE.avatarSrc);
    expect(proof).toHaveTextContent(TIM_WHITE_PROFILE.name);
    expect(proof).toHaveTextContent(TIM_WHITE_PROFILE.publicProfileHandle);
    expect(proofImage.getAttribute('alt')).toBe(proofAlt);
    // The proof is a real profile, not an illustrative/demo specimen.
    expect(screen.queryByTestId('homepage-profile-specimen')).toBeNull();
    expect(screen.queryByText(/Avery|Fieldnotes|Illustrative/)).toBeNull();
  });
});
