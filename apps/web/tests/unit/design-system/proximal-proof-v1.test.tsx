// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// The shipped homepage is invite-only: its one action ("Request an Invite")
// scrolls to the waitlist form that closes the same page, and its proof is the
// real template profile and releases workspace captures. Since Tim
// (2026-11-12, "use me for now") the product UI shows his own catalog from
// the featured-artist slot; the homepage-no-person-images guard owns which
// person images may render. This receipt asserts the action stays bound to
// the on-page form (no signup link while signup is closed) and that the hero
// shows the product, not a person's capture.
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
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/features/waitlist/WaitlistRoleForm', () => ({
  WaitlistRoleForm: ({ title }: { title: string }) => (
    <form data-testid='waitlist-role-form'>
      <h2>{title}</h2>
    </form>
  ),
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
  it('keeps the promise in the hero and its action bound to the claim at the close', () => {
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

    const intent = getClaimProfileIntent();
    const action = within(hero).getByTestId('homepage-primary-cta');
    expect(action).toHaveAttribute('href', intent.href);
    const target = container.querySelector(`#${HOMEPAGE_INVITE_ANCHOR}`);
    expect(target).not.toBeNull();
    expect(
      within(target as HTMLElement).getByTestId('homepage-close-cta')
    ).toHaveAttribute('href', intent.href);
  });

  it('offers one claim link and shows no person capture or unlabeled proof', () => {
    render(<HomepageStoryHero />);
    const hero = screen.getByTestId('marketing-section-hero');

    // The only labelled image naming the artist is the product mockup.
    for (const image of within(hero).queryAllByRole('img', {
      name: /Tim White/i,
    })) {
      expect(image).toHaveAccessibleName(/^Jovie for Mac:/);
    }
    expect(hero.querySelectorAll('a[href="/start"]')).toHaveLength(1);
    expect(hero.querySelector('a[href="/signup"]')).toBeNull();
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
