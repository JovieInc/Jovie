import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthActions } from '@/components/molecules/AuthActions';

// Mock the feature flags provider
vi.mock('@/components/providers/FeatureFlagsProvider', () => ({
  useFeatureFlags: () => ({
    flags: {
      waitlistEnabled: false,
      artistSearchEnabled: true,
      debugBannerEnabled: false,
      tipPromoEnabled: true,
    },
    isLoading: false,
    error: null,
  }),
}));

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useUser: () => ({
    isSignedIn: false,
  }),
}));

describe('AuthActions', () => {
  afterEach(cleanup);

  it('renders sign in and sign up links when user is not signed in', () => {
    render(<AuthActions />);

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('renders with correct styling classes', () => {
    render(<AuthActions />);

    // Use a more robust selector that looks for the container with specific classes
    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    
    // Check that the parent container has the expected flex classes
    const container = signInLink.closest('div');
    expect(container).toHaveClass('flex', 'items-center', 'space-x-4');
  });
});
