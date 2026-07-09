import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authShellMock, authLayoutMock, routerPrefetchMock, searchParamsState } =
  vi.hoisted(() => ({
    authShellMock: vi.fn(),
    authLayoutMock: vi.fn(),
    routerPrefetchMock: vi.fn(),
    searchParamsState: { value: '' },
  }));

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: true,
    isSignedIn: false,
  }),
}));

vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: {
    UNAUTHENTICATED: 'UNAUTHENTICATED',
  },
  resolveUserState: vi.fn().mockResolvedValue({
    state: 'UNAUTHENTICATED',
  }),
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
    AuthShell: (props: Record<string, unknown>) => {
      authShellMock(props);
      return reactModule.createElement('div', { 'data-testid': 'auth-shell' });
    },
  };
});

import { APP_ROUTES } from '@/constants/routes';
import { SignInPageClient } from '../../../app/(auth)/signin/SignInPageClient';

describe('signin page', () => {
  beforeEach(() => {
    authShellMock.mockReset();
    authLayoutMock.mockReset();
    routerPrefetchMock.mockReset();
    replaceMock.mockReset();
    searchParamsState.value = '';
    document.cookie =
      '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('renders AuthShell with the expected auth props', () => {
    render(<SignInPageClient />);

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
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
    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        forceOppositeModeHardNavigation: true,
        fallbackRedirectUrl: undefined,
        initialValues: undefined,
        mode: 'sign-in',
        oppositeModeUrl: undefined,
      })
    );
  });

  it('passes a valid email query param through to Clerk initialValues', async () => {
    searchParamsState.value = 'email=test%40example.com';

    render(<SignInPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: { emailAddress: 'test@example.com' },
      })
    );
  });

  it('ignores an invalid email query param', async () => {
    searchParamsState.value = 'email=not-an-email';

    render(<SignInPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: undefined,
      })
    );
  });

  it.skip('shows access_denied banner when oauth_error=access_denied (oauth error banner surface changed)', async () => {
    searchParamsState.value = 'oauth_error=access_denied';
    globalThis.history.replaceState(
      null,
      '',
      '/signin?oauth_error=access_denied'
    );

    render(<SignInPageClient />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in was cancelled. Try again, or pick a different method.'
    );

    await waitFor(() => {
      expect(globalThis.location.search).not.toContain('oauth_error');
    });
  });

  it.skip('shows a generic banner for unknown oauth_error values (oauth error banner surface changed)', async () => {
    searchParamsState.value = 'oauth_error=server_error';
    globalThis.history.replaceState(
      null,
      '',
      '/signin?oauth_error=server_error'
    );

    render(<SignInPageClient />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong with sign-in. Please try again.'
    );
  });

  it('preserves redirect_url when linking from sign in to sign up', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignInPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackRedirectUrl: '/onboarding',
        oppositeModeUrl: undefined,
      })
    );
  });

  it('uses desktop_return for desktop browser auth fallback and cross-link', async () => {
    searchParamsState.value =
      'desktop_return=%2Fapp%2Fsettings%3Ftab%3Dbilling';

    render(<SignInPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl:
          '/signup?desktop_return=%2Fapp%2Fsettings%3Ftab%3Dbilling',
        fallbackRedirectUrl:
          '/auth-return?route=%2Fapp%2Fsettings%3Ftab%3Dbilling',
      })
    );
    expect(routerPrefetchMock).toHaveBeenCalledWith(
      '/signup?desktop_return=%2Fapp%2Fsettings%3Ftab%3Dbilling'
    );
  });

  it('uses mobile_return for mobile browser auth fallback and cross-link', async () => {
    searchParamsState.value = 'mobile_return=%2Fapp%2Fsettings';

    render(<SignInPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signup?mobile_return=%2Fapp%2Fsettings',
        fallbackRedirectUrl: '/mobile-auth-return?route=%2Fapp%2Fsettings',
      })
    );
    expect(routerPrefetchMock).toHaveBeenCalledWith(
      '/signup?mobile_return=%2Fapp%2Fsettings'
    );
  });
});
