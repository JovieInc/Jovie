// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The shipped homepage closes on the claim entry that sits on the same page,
// and every door routes into /start (Tim, 2026-11-09). Its proof is the real
// template profile and releases workspace captures. It shows no real person:
// Tim, 2026-10-26, "no real person's face on /". The homepage-no-person-images
// guard owns that rule; this receipt asserts the promise and its claim entry
// stay on the page, with no signup link, without borrowing a person's capture.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HomepageInviteClose,
  HomepageStoryHero,
} from '@/components/homepage/HomepageEditorial';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  it('keeps the promise in the hero and its action bound to the on-page form', () => {
    const { container } = render(
      <>
        <HomepageStoryHero />
        <HomepageInviteClose />
      </>
    );

    const hero = screen.getByTestId('marketing-section-hero');
    const claim = screen.getByRole('heading', { level: 1 });
    expect(hero.contains(claim)).toBe(true);
    expect(claim).toHaveTextContent(HOMEPAGE_EDITORIAL_COPY.hero.headline);

    const action = within(hero).getByTestId('homepage-primary-cta');
    expect(action).toHaveAttribute('href', '/start');
    // The claim entry stays proximal: it closes the same page as the promise.
    const target = container.querySelector(`#${HOMEPAGE_INVITE_ANCHOR}`);
    expect(target).not.toBeNull();
    expect(
      within(target as HTMLElement).getByTestId('homepage-claim-entry')
    ).toBeInTheDocument();
  });

  it('offers no signup link and shows no person capture or unlabeled proof', () => {
    render(<HomepageStoryHero />);
    const hero = screen.getByTestId('marketing-section-hero');

    expect(within(hero).queryByRole('img', { name: /Tim White/i })).toBeNull();
    expect(hero.querySelector('a[href="/signup"]')).toBeNull();
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
