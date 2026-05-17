import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';

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
    render(<HeaderNav authMode='public-static' />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', '/signup');
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
    fireEvent.focus(trigger);

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

    // After JOV-2147 (conditional render): flyout is not in the DOM when closed.
    expect(
      container.querySelector('#marketing-header-flyout-features')
    ).toBeNull();

    fireEvent.pointerEnter(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Flyout mounts closed first, then gets the open class on the next frame so
    // the CSS transition can run.
    const flyout = container.querySelector('#marketing-header-flyout-features');
    expect(flyout).not.toBeNull();
    expect(flyout).not.toHaveClass('marketing-glass-header__flyout--open');
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(flyout).toHaveClass('marketing-glass-header__flyout--open');

    fireEvent.pointerLeave(header, { relatedTarget: null });
    fireEvent.pointerEnter(flyout as Element);
    vi.advanceTimersByTime(220);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Flyout stays mounted while open.
    expect(
      container.querySelector('#marketing-header-flyout-features')
    ).not.toBeNull();
  });
});
