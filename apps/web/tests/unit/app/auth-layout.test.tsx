import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RenderAuthLayoutOptions {
  readonly clerkMockFlag?: string;
  readonly resolvedPublishableKey?: string;
}

async function renderAuthRouteLayout({
  clerkMockFlag = '0',
  resolvedPublishableKey,
}: RenderAuthLayoutOptions) {
  vi.resetModules();

  vi.doMock('@/lib/env-public', () => ({
    publicEnv: {
      NEXT_PUBLIC_CLERK_MOCK: clerkMockFlag,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: resolvedPublishableKey,
      NEXT_PUBLIC_PROFILE_HOSTNAME: 'jov.ie',
      NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie',
      NEXT_PUBLIC_APP_URL: 'https://jov.ie',
      NEXT_PUBLIC_APP_HOSTNAME: 'jov.ie',
      NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN: 'jov.ie',
    },
  }));

  vi.doMock('@/lib/flags/client', () => ({
    AppFlagProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }));

  vi.doMock('@/lib/flags/server', () => ({
    getAppFlagsSnapshot: vi.fn().mockResolvedValue({}),
  }));

  vi.doMock('@/lib/auth/staging-clerk-keys', () => ({
    resolvePublishableKeyFromHeaders: vi
      .fn()
      .mockResolvedValue(resolvedPublishableKey),
  }));

  vi.doMock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue(new Headers()),
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

  const { default: AuthRouteLayout } = await import(
    '../../../app/(auth)/layout'
  );

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
    await renderAuthRouteLayout({ resolvedPublishableKey: undefined });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-child')).not.toBeInTheDocument();
  });

  it('renders auth children for private forwarded locations when the resolver returns a live key', async () => {
    await renderAuthRouteLayout({
      resolvedPublishableKey: 'pk_test_example',
    });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });

  it('renders auth children through AuthClientProviders when Clerk is available', async () => {
    await renderAuthRouteLayout({
      resolvedPublishableKey: 'pk_test_example',
    });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });

  it('renders the unavailable fallback on staging when the resolver returns no key', async () => {
    await renderAuthRouteLayout({
      resolvedPublishableKey: undefined,
    });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
  });

  it('renders auth children on staging when the resolver returns a staging key', async () => {
    await renderAuthRouteLayout({
      resolvedPublishableKey: 'pk_live_staging_example',
    });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });

  it('renders the unavailable fallback when Clerk mock mode is enabled', async () => {
    await renderAuthRouteLayout({
      clerkMockFlag: '1',
      resolvedPublishableKey: 'pk_test_example',
    });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-child')).not.toBeInTheDocument();
  });
});
