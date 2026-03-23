import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RenderAuthLayoutOptions {
  readonly clerkMockFlag?: string;
  readonly publishableKey?: string;
}

async function renderAuthRouteLayout({
  clerkMockFlag = '0',
  publishableKey,
}: RenderAuthLayoutOptions) {
  vi.resetModules();

  vi.doMock('@/lib/env-public', () => ({
    publicEnv: {
      NEXT_PUBLIC_CLERK_MOCK: clerkMockFlag,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    },
  }));

  vi.doMock('@/lib/feature-flags/server', () => ({
    getFeatureFlagsBootstrap: vi.fn().mockResolvedValue({}),
  }));

  vi.doMock('@/lib/feature-flags/client', () => ({
    FeatureFlagsProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }));

  vi.doMock('@/components/providers/AuthClientProviders', () => ({
    AuthClientProviders: ({ children }: { children: ReactNode }) => (
      <div data-testid='auth-client-providers'>{children}</div>
    ),
  }));

  vi.doMock('@/features/auth', () => ({
    AuthLayout: ({ children }: { children: ReactNode }) => (
      <div data-testid='auth-layout'>{children}</div>
    ),
    AuthUnavailableCard: () => <div data-testid='auth-clerk-unavailable' />,
  }));

  const { default: AuthRouteLayout } = await import('../../../app/(auth)/layout');

  render(
    await AuthRouteLayout({
      children: <div data-testid='auth-child'>auth child</div>,
    })
  );
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('auth route layout', () => {
  it('renders the unavailable fallback instead of auth children when Clerk is unavailable', async () => {
    await renderAuthRouteLayout({ publishableKey: undefined });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-client-providers')).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-child')).not.toBeInTheDocument();
  });

  it('renders auth children through AuthClientProviders when Clerk is available', async () => {
    await renderAuthRouteLayout({ publishableKey: 'pk_test_example' });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });
});
