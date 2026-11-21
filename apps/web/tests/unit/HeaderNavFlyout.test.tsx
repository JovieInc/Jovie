import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

// Mock Clerk (MobileNav uses useAuthSafe which wraps Clerk hooks)
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useClerk: () => ({
    setActive: async () => {},
  }),
  useSignIn: () => ({
    fetchStatus: 'idle',
    errors: [],
    signIn: null,
  }),
  SignedIn: ({ children }: { children: React.ReactNode }) => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => children,
}));

describe('HeaderNav flyout interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders primary navigation links', () => {
    render(<HeaderNav />);

    expect(
      screen.queryByRole('link', { name: 'Pricing' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders static public auth actions without client auth state', () => {
    render(
      <HeaderNav
        authMode='public-static'
        penContractId={MARKETING_PEN_CONTRACT_IDS.shell.header}
      />
    );

    expect(screen.getByTestId('header-nav')).toHaveClass('header-nav');
    expect(screen.getByTestId('header-nav')).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.header
    );
    const loginLink = screen.getByRole('link', { name: 'Log in' });
    expect(loginLink).toHaveAttribute('href', '/signin');
    expect(loginLink.parentElement).toHaveClass('gap-2');
    // Default public CTA (no publicCta override) follows the front-door contract.
    // MarketingHeader supplies route-specific CTA labels separately.
    expect(
      screen.getByRole('link', { name: 'Claim your free profile' })
    ).toHaveAttribute('href', '/start');
    const publicCta = screen.getByRole('link', {
      name: 'Claim your free profile',
    });
    expect(publicCta).not.toHaveAttribute('data-pen-contract');
    expect(publicCta).toHaveAttribute('data-variant', 'primary');
    expect(publicCta).toHaveAttribute('data-size', 'marketing');
  });

  it('uses the canonical Button for the minimal pill sign-in action', () => {
    render(
      <HeaderNav
        authMode='public-static'
        minimalAuth
        minimalAuthVariant='pill'
      />
    );

    const signIn = screen.getByRole('link', { name: 'Sign in' });
    expect(signIn).not.toHaveAttribute('data-pen-contract');
    expect(signIn).toHaveAttribute('data-variant', 'primary');
    expect(signIn).toHaveAttribute('data-size', 'md');
  });

  it('uses one CTA contract for the public label and destination', () => {
    render(
      <HeaderNav
        authMode='public-static'
        publicCta={{ href: '/start', label: 'Get started' }}
      />
    );

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/start'
    );
  });

  it('closes marketing flyouts with Escape', () => {
    render(
      <HeaderNav
        authMode='public-static'
        presentation='marketing-glass'
        flyoutMenus={[
          {
            id: 'features',
            label: 'Features',
            heading: 'Product',
            links: [
              {
                href: '/artist-profiles',
                label: 'Artist Profiles',
                description: 'Artist profile pages',
              },
            ],
          },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /Features/ });
    // Bare Focus must not open (Capture changed UI Tab-into-main).
    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('keeps marketing flyouts open while moving from trigger to panel', () => {
    vi.useFakeTimers();
    const { container } = render(
      <HeaderNav
        authMode='public-static'
        presentation='marketing-glass'
        flyoutMenus={[
          {
            id: 'features',
            label: 'Features',
            heading: 'Product',
            links: [
              {
                href: '/artist-profiles',
                label: 'Artist Profiles',
                description: 'Artist profile pages',
              },
            ],
          },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /Features/ });
    const header = screen.getByTestId('header-nav');

    // JOV-14244: flyouts stay mounted for native popover/@starting-style, but
    // closed panels are inert and lack the open class.
    const flyoutClosed = container.querySelector(
      '#marketing-header-flyout-features'
    );
    expect(flyoutClosed).not.toBeNull();
    expect(flyoutClosed).not.toHaveClass(
      'marketing-glass-header__flyout--open'
    );
    expect(flyoutClosed).toHaveAttribute('aria-hidden', 'true');

    fireEvent.pointerEnter(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const flyout = container.querySelector('#marketing-header-flyout-features');
    expect(flyout).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(flyout).toHaveClass('marketing-glass-header__flyout--open');
    expect(flyout).not.toHaveAttribute('aria-hidden', 'true');

    fireEvent.pointerLeave(header, { relatedTarget: null });
    fireEvent.pointerEnter(flyout as Element);
    vi.advanceTimersByTime(220);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      container.querySelector('#marketing-header-flyout-features')
    ).not.toBeNull();
  });
});
