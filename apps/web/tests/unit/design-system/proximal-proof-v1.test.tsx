// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The shipped homepage hero keeps the jov.ie/ claim and its /start handoff in
// one section. It shows no real person: Tim, 2026-10-26, "no real person's
// face on /". The founder's live capture used to be the proof here; the
// homepage-no-person-images guard now owns that rule, and this receipt asserts
// the claim stays bound to /start without borrowing a person's capture.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageArtistHero } from '@/components/homepage/HomepageArtistProfile';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';

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
  it('keeps read-only discovery beside the approved identity promise', () => {
    render(<HomepageArtistHero />);
    const hero = screen.getByTestId('marketing-section-hero');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      HOMEPAGE_COPY.hero.headline
    );
    const input = within(hero).getByRole('textbox', {
      name: 'Search your name',
    });
    expect(input.closest('form')).not.toHaveAttribute('action', '/start');
    expect(within(hero).getByRole('button', { name: 'Find me' })).toBeVisible();
    expect(within(hero).queryByRole('img', { name: /Tim White/i })).toBeNull();
  });

  it('offers the role waitlist and invitation recovery without claiming an account', () => {
    render(<HomepageArtistHero />);
    expect(
      screen.getByRole('link', { name: HOMEPAGE_COPY.access.label })
    ).toHaveAttribute('href', '#waitlist');
    expect(
      screen.getByRole('link', { name: HOMEPAGE_COPY.access.invite })
    ).toHaveAttribute('href', '/signin');
    expect(screen.getByText(HOMEPAGE_COPY.hero.supportNote)).toBeVisible();
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
