// JOV-INV-038 evaluator receipt: proximal-proof (visual-semantic).
//
// "Claims need proximal, route-specific proof. Proof should support the
// promise being made on that route, not generic proof inserted mechanically."
//
// Public signup is open (2026-11-09): the homepage's one action is the shared
// claim-profile intent into /start, repeated by the section that closes the
// page, and its proof is the real template profile and releases workspace
// captures. It shows no real person: Tim, 2026-10-26, "no real person's face
// on /". The homepage-no-person-images guard owns that rule. While the
// PUBLIC_SIGNUP_CLOSED kill switch is on, this receipt asserts the action
// stays bound to the on-page form (no signup link while signup is closed)
// without borrowing a person's capture.
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the promise in the hero and its action on the one claim intent', () => {
    render(
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
    expect(action).toHaveTextContent(intent.label);
    // The close repeats the same action; no second destination competes.
    expect(screen.getByTestId('homepage-close-cta')).toHaveAttribute(
      'href',
      intent.href
    );
    expect(hero.querySelector('a[href="/signup"]')).toBeNull();
    expect(within(hero).queryByRole('img', { name: /Tim White/i })).toBeNull();
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });

  it('signup closed: keeps the action bound to the on-page form', () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
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
    expect(action).toHaveAttribute('href', `#${HOMEPAGE_INVITE_ANCHOR}`);
    const target = container.querySelector(`#${HOMEPAGE_INVITE_ANCHOR}`);
    expect(target).not.toBeNull();
    expect(
      within(target as HTMLElement).getByTestId('waitlist-role-form')
    ).toBeInTheDocument();
  });

  it('signup closed: offers no signup link and shows no person capture or unlabeled proof', () => {
    vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
    render(<HomepageStoryHero />);
    const hero = screen.getByTestId('marketing-section-hero');

    expect(within(hero).queryByRole('img', { name: /Tim White/i })).toBeNull();
    expect(
      hero.querySelector('a[href="/start"], a[href="/signup"]')
    ).toBeNull();
    expect(
      screen.queryByText(/Claimed|Verified customer|Illustrative/i)
    ).toBeNull();
  });
});
