import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RenderAuthLayoutOptions {
  readonly clerkMockFlag?: string;
  readonly forwardedHost?: string;
  readonly forwardedProto?: string;
  readonly publishableKey?: string;
  readonly stagingPublishableKey?: string;
  readonly stagingSecretKey?: string;
}

const originalStagingPublishableKey = process.env.CLERK_PUBLISHABLE_KEY_STAGING;
const originalStagingSecretKey = process.env.CLERK_SECRET_KEY_STAGING;

async function renderAuthRouteLayout({
  clerkMockFlag = '0',
  forwardedHost = 'jov.ie',
  forwardedProto = 'https',
  publishableKey,
  stagingPublishableKey,
  stagingSecretKey,
}: RenderAuthLayoutOptions) {
  vi.resetModules();

  if (stagingPublishableKey === undefined) {
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
  } else {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = stagingPublishableKey;
  }

  if (stagingSecretKey === undefined) {
    delete process.env.CLERK_SECRET_KEY_STAGING;
  } else {
    process.env.CLERK_SECRET_KEY_STAGING = stagingSecretKey;
  }

  vi.doMock('@/lib/env-public', () => ({
    publicEnv: {
      NEXT_PUBLIC_CLERK_MOCK: clerkMockFlag,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
    },
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

  vi.doMock('next/headers', () => ({
    headers: async () =>
      new Headers({
        host: forwardedHost,
        'x-forwarded-host': forwardedHost,
        'x-forwarded-proto': forwardedProto,
      }),
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
  if (originalStagingPublishableKey === undefined) {
    delete process.env.CLERK_PUBLISHABLE_KEY_STAGING;
  } else {
    process.env.CLERK_PUBLISHABLE_KEY_STAGING = originalStagingPublishableKey;
  }

  if (originalStagingSecretKey === undefined) {
    delete process.env.CLERK_SECRET_KEY_STAGING;
  } else {
    process.env.CLERK_SECRET_KEY_STAGING = originalStagingSecretKey;
  }

  vi.resetModules();
  vi.clearAllMocks();
});

describe('auth route layout', () => {
  it('renders the unavailable fallback instead of auth children when Clerk is unavailable', async () => {
    await renderAuthRouteLayout({ publishableKey: undefined });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-child')).not.toBeInTheDocument();
  });

  it('renders auth children for private http forwarded locations when real Clerk keys exist', async () => {
    await renderAuthRouteLayout({
      publishableKey: 'pk_test_example',
      forwardedHost: '[::1]:3000, localhost:3000',
      forwardedProto: 'HTTP, https',
    });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });

  it('renders auth children through AuthClientProviders when Clerk is available', async () => {
    await renderAuthRouteLayout({ publishableKey: 'pk_test_example' });

    expect(screen.getByTestId('auth-client-providers')).toBeInTheDocument();
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-clerk-unavailable')
    ).not.toBeInTheDocument();
  });

  it('renders the unavailable fallback on staging when staging runtime keys are missing', async () => {
    await renderAuthRouteLayout({
      forwardedHost: 'staging.jov.ie',
      publishableKey: 'pk_live_prod_example',
    });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
  });

  it('renders auth children on staging when staging runtime keys exist', async () => {
    await renderAuthRouteLayout({
      forwardedHost: 'staging.jov.ie',
      publishableKey: 'pk_live_prod_example',
      stagingPublishableKey: 'pk_live_staging_example',
      stagingSecretKey: 'sk_live_staging_example',
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
      publishableKey: 'pk_test_example',
    });

    expect(screen.getByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('auth-clerk-unavailable')).toBeInTheDocument();
    expect(
      screen.queryByTestId('auth-client-providers')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('auth-child')).not.toBeInTheDocument();
  });
});
