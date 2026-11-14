import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const { pathname, track } = vi.hoisted(() => ({
  pathname: vi.fn<() => string | null>(() => '/pricing'),
  track: vi.fn(),
}));

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => pathname(),
}));

vi.mock('@/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  track: (...args: unknown[]) => track(...args),
}));

import { MarketingHeader } from './MarketingHeader';

// Product feature flags stay at their shipped values here; the flag matrix
// lives in tests/unit/components/site/MarketingHeader.test.tsx.
describe('MarketingHeader states', () => {
  beforeEach(() => {
    pathname.mockReturnValue('/pricing');
    track.mockClear();
  });

  it('opens the mobile menu from the landing header by pointer and keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingHeader />);

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByRole('link', { name: 'Log in' })
    ).toHaveAttribute('href', APP_ROUTES.SIGNIN);
    await expectNoA11yViolations(container);

    const menu = screen.getByRole('button', { name: 'Open menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.click(menu);
    expect(
      await screen.findByRole('button', { name: 'Close menu' })
    ).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);

    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('button', { name: 'Open menu' })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves focus from the mark through the auth actions in order', async () => {
    const user = userEvent.setup();
    render(
      <MarketingHeader
        navLinks={[]}
        primaryCta={{ href: '/#request-invite', label: 'Request an Invite' }}
      />
    );

    await user.tab();
    expect(screen.getByTestId('site-logo-link')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', { name: 'Request an Invite' })
    ).toHaveFocus();
  });

  it('always draws the center nav links on a landing route', () => {
    render(<MarketingHeader />);

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getAllByRole('link', { name: 'Pricing' }).length
    ).toBeGreaterThan(0);
  });

  it('sends the default landing CTA into the one /start flow', () => {
    render(<MarketingHeader />);

    expect(
      within(screen.getByRole('banner')).getByRole('link', {
        name: 'Claim your free profile',
      })
    ).toHaveAttribute('href', APP_ROUTES.START);
  });

  it('draws no empty nav row or menu when there are no links', async () => {
    const { container } = render(<MarketingHeader navLinks={[]} />);

    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
    expect(screen.getByTestId('site-logo-link')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps only Log in when the page withholds its primary CTA', async () => {
    const { container } = render(
      <MarketingHeader navLinks={[]} hidePrimaryCta />
    );

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'Log in' })).toBeVisible();
    // The mark and Log in are the only links left.
    expect(within(banner).getAllByRole('link')).toHaveLength(2);
    expect(
      screen.queryByRole('link', { name: 'Request an Invite' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('reduces the minimal header to the mark and a Sign in link', async () => {
    const { container } = render(
      <MarketingHeader
        variant='minimal'
        primaryCta={{ href: '/signup', label: 'Request Access' }}
      />
    );

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long or right-to-left CTA label as one named link', async () => {
    const long = 'Request an invite to set up your page in the next wave';
    const { container, rerender } = render(
      <MarketingHeader
        navLinks={[]}
        primaryCta={{ href: '/#request-invite', label: long }}
      />
    );
    expect(screen.getByRole('link', { name: long })).toHaveAttribute(
      'href',
      '/#request-invite'
    );
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <MarketingHeader
          navLinks={[]}
          primaryCta={{ href: '/#request-invite', label: 'اطلب دعوة' }}
        />
      </div>
    );
    expect(screen.getByRole('link', { name: 'اطلب دعوة' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
