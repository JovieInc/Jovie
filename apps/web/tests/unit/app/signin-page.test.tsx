import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clerkSignInMock, routerPrefetchMock, searchParamsState } = vi.hoisted(
  () => ({
    clerkSignInMock: vi.fn(),
    routerPrefetchMock: vi.fn(),
    searchParamsState: { value: '' },
  })
);

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);
    return <div data-testid='clerk-sign-in' />;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  useRouter: () => ({ prefetch: routerPrefetchMock }),
}));

vi.mock('@/features/auth', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid='auth-layout'>{children}</div>
  ),
  AuthRoutePrefetch: ({ href }: { href: string }) => {
    routerPrefetchMock(href);
    return null;
  },
}));

import { APP_ROUTES } from '@/constants/routes';
import SignInPage from '../../../app/(auth)/signin/page';

describe('signin page', () => {
  beforeEach(() => {
    clerkSignInMock.mockReset();
    routerPrefetchMock.mockReset();
    searchParamsState.value = '';
  });

  it('renders Clerk SignIn with the expected auth props', async () => {
    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(routerPrefetchMock).toHaveBeenCalledWith(APP_ROUTES.SIGNUP);
    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'hash',
        oauthFlow: 'redirect',
        signUpUrl: APP_ROUTES.SIGNUP,
        fallbackRedirectUrl: APP_ROUTES.DASHBOARD,
        initialValues: undefined,
      })
    );
  });

  it('passes a valid email query param through to Clerk initialValues', async () => {
    searchParamsState.value = 'email=test%40example.com';

    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: { emailAddress: 'test@example.com' },
      })
    );
  });

  it('ignores an invalid email query param', async () => {
    searchParamsState.value = 'email=not-an-email';

    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: undefined,
      })
    );
  });

  it('preserves redirect_url on the footer sign-up link', async () => {
    searchParamsState.value = 'redirect_url=%2Fapp%2Fdashboard';

    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signUpUrl: '/signup?redirect_url=%2Fapp%2Fdashboard',
      })
    );
  });
});
