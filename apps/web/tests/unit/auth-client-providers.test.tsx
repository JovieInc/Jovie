import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkProviderMock, envState } = vi.hoisted(() => ({
  clerkProviderMock: vi.fn(),
  envState: { clerkMockFlag: '0' },
}));

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children, ...props }: { children: ReactNode }) => {
    clerkProviderMock(props);
    return <div data-testid='clerk-provider'>{children}</div>;
  },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  ClerkSafeDefaultsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  ClerkSafeValuesProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    get NEXT_PUBLIC_CLERK_MOCK() {
      return envState.clerkMockFlag;
    },
  },
}));

import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { authClerkAppearance } from '@/components/providers/clerkAppearance';
import { APP_ROUTES } from '@/constants/routes';

describe('AuthClientProviders', () => {
  beforeEach(() => {
    clerkProviderMock.mockReset();
    envState.clerkMockFlag = '0';
    globalThis.history.replaceState(null, '', '/signin');
  });

  it('bypasses Clerk when no publishable key is configured', () => {
    render(
      <AuthClientProviders publishableKey={undefined}>
        <div data-testid='child'>child</div>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clerkProviderMock).not.toHaveBeenCalled();
  });

  it('bypasses Clerk when NEXT_PUBLIC_CLERK_MOCK is enabled', () => {
    envState.clerkMockFlag = '1';

    render(
      <AuthClientProviders publishableKey='pk_test_example'>
        <div data-testid='child'>child</div>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clerkProviderMock).not.toHaveBeenCalled();
  });

  it('bypasses Clerk when the publishable key looks mocked', () => {
    render(
      <AuthClientProviders publishableKey='mock-publishable-key'>
        <div data-testid='child'>child</div>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clerkProviderMock).not.toHaveBeenCalled();
  });

  it('passes the expected Clerk provider props for a real publishable key', async () => {
    const originalLocation = globalThis.location;

    try {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: new URL('https://staging.jov.ie/signin'),
      });

      render(
        <AuthClientProviders publishableKey='pk_test_example'>
          <div data-testid='child'>child</div>
        </AuthClientProviders>
      );

      await waitFor(() => {
        expect(screen.getByTestId('clerk-provider')).toBeInTheDocument();
      });
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(clerkProviderMock).toHaveBeenCalledTimes(1);

      const props = clerkProviderMock.mock.calls[0]?.[0];
      expect(props).toMatchObject({
        publishableKey: 'pk_test_example',
        proxyUrl: '/__clerk',
        signInUrl: APP_ROUTES.SIGNIN,
        signUpUrl: APP_ROUTES.SIGNUP,
        signInFallbackRedirectUrl: APP_ROUTES.DASHBOARD,
        signUpFallbackRedirectUrl: APP_ROUTES.WAITLIST,
        appearance: authClerkAppearance,
      });
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('bypasses Clerk for live keys on localhost', () => {
    const originalLocation = globalThis.location;

    try {
      globalThis.history.replaceState(null, '', '/signin');
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: new URL('http://localhost:3100/signin'),
      });

      render(
        <AuthClientProviders publishableKey='pk_live_example'>
          <div data-testid='child'>child</div>
        </AuthClientProviders>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(clerkProviderMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('can force-enable Clerk for auth pages on localhost', async () => {
    const originalLocation = globalThis.location;

    try {
      globalThis.history.replaceState(null, '', '/signin');
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: new URL('http://localhost:3100/signin'),
      });

      render(
        <AuthClientProviders forceEnableClerk publishableKey='pk_live_example'>
          <div data-testid='child'>child</div>
        </AuthClientProviders>
      );

      await waitFor(() => {
        expect(screen.getByTestId('clerk-provider')).toBeInTheDocument();
      });
      expect(clerkProviderMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
