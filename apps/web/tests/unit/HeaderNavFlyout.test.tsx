import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';

// Mock Clerk (MobileNav uses useAuthSafe which wraps Clerk hooks)
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
}));

vi.mock('@clerk/nextjs/legacy', () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: undefined,
    setActive: async () => {},
  }),
}));

describe('HeaderNav flyout interactions', () => {
  it('renders primary navigation links', () => {
    render(<HeaderNav />);

    expect(
      screen.queryByRole('link', { name: 'Pricing' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
