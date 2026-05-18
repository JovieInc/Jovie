import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authLayoutMock,
  clerkSignInMock,
  routerPrefetchMock,
  searchParamsState,
} = vi.hoisted(() => ({
  authLayoutMock: vi.fn(),
  clerkSignInMock: vi.fn(),
  routerPrefetchMock: vi.fn(),
  searchParamsState: { value: '' },
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);
    return <div data-testid='clerk-sign-in' />;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/features/auth', async () => {
  const reactModule = await import('react');
  return {
    AuthLayout: (props: { children: ReactNode }) => {
      authLayoutMock(props);
      return reactModule.createElement(
        'div',
        { 'data-testid': 'auth-layout' },
        props.children
      );
    },
    AuthRoutePrefetch: ({ href }: { href: string }) => {
      routerPrefetchMock(href);
      return null;
    },
    // Import the real AuthShell so the Clerk wiring stays exercised end to end.
    AuthShell: (await import('@/components/features/auth/AuthShell')).AuthShell,
  };
});

import { APP_ROUTES } from '@/constants/routes';
import SignInPage from '../../../app/(auth)/signin/page';

describe('signin page', () => {
  function fullAuthUrl(path: string) {
    return new URL(path, globalThis.location.origin).toString();
  }

  beforeEach(() => {
    authLayoutMock.mockReset();
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
    expect(authLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: 'Sign in',
        showFormTitle: false,
        showFooterPrompt: false,
        layoutVariant: 'split',
      })
    );
    expect(
      screen.queryByText('Welcome back to Jovie.')
    ).not.toBeInTheDocument();
    expect(routerPrefetchMock).toHaveBeenCalledWith(APP_ROUTES.SIGNUP);
    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'path',
        path: '/signin',
        oauthFlow: 'redirect',
        // Cross-link for sign-in → /support (Need help?). SSO-only — waitlist
        // is a dead end for returnees who lost their SSO session (JOV-2446).
        signUpUrl: fullAuthUrl(APP_ROUTES.SUPPORT),
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

  it('passes oidcPrompt=select_account to Clerk SignIn so account chooser always appears', async () => {
    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oidcPrompt: 'select_account',
      })
    );
  });

  it('shows access_denied banner when oauth_error=access_denied', async () => {
    searchParamsState.value = 'oauth_error=access_denied';
    globalThis.history.replaceState(
      null,
      '',
      '/signin?oauth_error=access_denied'
    );

    render(<SignInPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in was cancelled. Try again, or pick a different method.'
    );

    await waitFor(() => {
      expect(globalThis.location.search).not.toContain('oauth_error');
    });
  });

  it('shows a generic banner for unknown oauth_error values', async () => {
    searchParamsState.value = 'oauth_error=server_error';
    globalThis.history.replaceState(
      null,
      '',
      '/signin?oauth_error=server_error'
    );

    render(<SignInPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong with sign-in. Please try again.'
    );
  });

  it('preserves redirect_url when linking from sign in to sign up', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        // Cross-link for sign-in preserves redirect params toward /support (JOV-2446).
        signUpUrl: fullAuthUrl('/support?redirect_url=%2Fonboarding'),
      })
    );
  });
});
