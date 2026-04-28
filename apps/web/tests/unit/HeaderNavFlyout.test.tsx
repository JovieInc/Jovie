import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
      screen.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });
});
