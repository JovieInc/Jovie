import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for each HeaderNav presentation. The flyout
// timing, dock scroll and user-slot contracts live in tests/unit/HeaderNav*.
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useClerk: () => ({ setActive: async () => {} }),
  useSignIn: () => ({ fetchStatus: 'idle', errors: [], signIn: null }),
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
}));

// Records whether the account menu module was evaluated. The marketing header
// must reach it only through the code-split wrapper, never a static import.
const accountMenu = vi.hoisted(() => ({ evaluated: false }));
vi.mock('@/components/organisms/user-button/UserButton', () => {
  accountMenu.evaluated = true;
  return { UserButton: () => null };
});

import { type HeaderFlyoutMenu, HeaderNav } from './HeaderNav';

const FLYOUTS: readonly HeaderFlyoutMenu[] = [
  {
    id: 'product',
    label: 'Product',
    heading: 'Product',
    links: [
      {
        href: '/artist-profiles',
        label: 'Artist Profiles',
        description: 'One page for every release',
      },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
];

function primaryNav() {
  return screen.getByRole('navigation', { name: 'Primary Navigation' });
}

describe('HeaderNav states', () => {
  it('renders the public header with the logo, nav links and both auth actions', async () => {
    const { container } = render(
      <HeaderNav
        authMode='public-static'
        hideNav={false}
        navLinks={[
          { href: APP_ROUTES.PRICING, label: 'Pricing' },
          { href: '#faq', label: 'FAQ' },
        ]}
        publicCta={{ href: APP_ROUTES.SIGNUP, label: 'Get Started' }}
      />
    );

    const nav = primaryNav();
    const pricing = within(nav).getByRole('link', { name: 'Pricing' });
    expect(pricing).toHaveAttribute('href', APP_ROUTES.PRICING);
    expect(pricing.parentElement).toHaveClass('max-lg:hidden', 'lg:flex');
    expect(nav.querySelector('[class~="w-px"]')).not.toBeNull();
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute(
      'href',
      '#faq'
    );
    expect(within(nav).getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
    expect(
      within(nav).getByRole('link', { name: 'Get Started' })
    ).toHaveAttribute('data-variant', 'primary');
    await expectNoA11yViolations(container);
  });

  it('renders the minimal sign-in text link without a public CTA', async () => {
    const { container } = render(
      <HeaderNav
        authMode='public-static'
        minimalAuth
        minimalAuthLabel='Log in'
      />
    );

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('does not load the account menu for a signed-out visitor', () => {
    render(
      <HeaderNav
        authMode='public-static'
        navLinks={[{ href: APP_ROUTES.PRICING, label: 'Pricing' }]}
        publicCta={{ href: APP_ROUTES.SIGNUP, label: 'Get Started' }}
      />
    );

    expect(
      within(primaryNav()).getByRole('link', { name: 'Log in' })
    ).toBeInTheDocument();
    expect(accountMenu.evaluated).toBe(false);
  });

  it('sends the default public CTA into the one /start flow', () => {
    render(<HeaderNav authMode='public-static' hideNav={false} />);

    expect(
      screen.getByRole('link', { name: 'Claim your free profile' })
    ).toHaveAttribute('href', APP_ROUTES.START);
  });

  it('drops the desktop nav group and its divider when there are no nav links', async () => {
    const { container } = render(
      <HeaderNav authMode='public-static' navLinks={[]} />
    );

    const nav = primaryNav();
    expect(nav.querySelector('[class~="max-lg:hidden"]')).toBeNull();
    expect(nav.querySelector('[class~="w-px"]')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens a marketing flyout from its trigger and closes it with Escape back on the trigger', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HeaderNav
        authMode='public-static'
        presentation='marketing-glass'
        flyoutMenus={FLYOUTS}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Product' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-slot', 'plain-button');
    await expectNoA11yViolations(container);

    await user.hover(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const flyout = container.querySelector('#marketing-header-flyout-product');
    expect(flyout).not.toBeNull();
    expect(flyout).toHaveClass('marketing-glass-header__flyout--open');
    // Native popover path (JOV-14244) when the runtime exposes showPopover.
    if (
      typeof HTMLElement !== 'undefined' &&
      'showPopover' in HTMLElement.prototype
    ) {
      expect(flyout).toHaveAttribute('popover', 'manual');
    }
    expect(
      within(flyout as HTMLElement).getByRole('link', { name: /Pricing/ })
    ).toHaveAttribute('href', '/pricing');
    await expectNoA11yViolations(container);

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(flyout).not.toHaveClass('marketing-glass-header__flyout--open');
    expect(trigger).toHaveFocus();
  });

  it('hydrates the flyout before opening it with the native popover API', async () => {
    const props = {
      authMode: 'public-static' as const,
      presentation: 'marketing-glass' as const,
      flyoutMenus: FLYOUTS,
    };
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'showPopover'
    );
    const showPopover = vi.fn(function (this: HTMLElement) {
      if (!this.hasAttribute('popover')) {
        throw new DOMException('not a popover', 'NotSupportedError');
      }
    });
    const container = document.createElement('div');
    try {
      // Model SSR without the native API, then enable it before hydration.
      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        value: undefined,
      });
      container.innerHTML = renderToString(<HeaderNav {...props} />);
      const panel = container.querySelector('#marketing-header-flyout-product');
      expect(panel).not.toHaveAttribute('popover');

      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        value: showPopover,
      });
      document.body.append(container);
      const view = render(<HeaderNav {...props} />, {
        container,
        hydrate: true,
      });
      try {
        await userEvent
          .setup()
          .hover(within(container).getByRole('button', { name: 'Product' }));
        expect(
          container.querySelector('#marketing-header-flyout-product')
        ).toBe(panel);
        expect(panel).toHaveAttribute('popover', 'manual');
        expect(showPopover).toHaveBeenCalledTimes(1);
      } finally {
        view.unmount();
      }
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', original);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
      }
      container.remove();
    }
  });

  it('has no axe violations for long nav labels in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HeaderNav
          authMode='public-static'
          navLinks={[
            {
              href: '/artist-profiles',
              label: 'Artist Profiles And Press Kits',
            },
            { href: '/pricing', label: 'Pricing For Labels And Managers' },
          ]}
          publicCta={{ href: APP_ROUTES.SIGNUP, label: 'Claim Your Profile' }}
        />
      </div>
    );

    expect(
      within(primaryNav()).getByRole('link', {
        name: 'Artist Profiles And Press Kits',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
