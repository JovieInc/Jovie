import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkProviderMock } = vi.hoisted(() => ({
  clerkProviderMock: vi.fn(),
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
    NEXT_PUBLIC_CLERK_MOCK: '0',
  },
}));

import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { APP_ROUTES } from '@/constants/routes';

describe('AuthClientProviders', () => {
  beforeEach(() => {
    clerkProviderMock.mockReset();
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

  it('uses stock Clerk provider config on localhost auth routes', () => {
    render(
      <AuthClientProviders publishableKey='pk_test_example'>
        <div data-testid='child'>child</div>
      </AuthClientProviders>
    );

    expect(screen.getByTestId('clerk-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(clerkProviderMock).toHaveBeenCalledTimes(1);

    const props = clerkProviderMock.mock.calls[0]?.[0];
    expect(props).toMatchObject({
      publishableKey: 'pk_test_example',
      proxyUrl: undefined,
      signInUrl: APP_ROUTES.SIGNIN,
      signUpUrl: APP_ROUTES.SIGNUP,
      signInFallbackRedirectUrl: APP_ROUTES.DASHBOARD,
      signUpFallbackRedirectUrl: APP_ROUTES.ONBOARDING,
    });
    expect(props).not.toHaveProperty('ui');
    expect(props).not.toHaveProperty('prefetchUI');
  });
});
