import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clerkSignInMock,
  googleOneTapMock,
  routerPrefetchMock,
  searchParamsState,
} = vi.hoisted(() => ({
  clerkSignInMock: vi.fn(),
  googleOneTapMock: vi.fn(),
  routerPrefetchMock: vi.fn(),
  searchParamsState: { value: '' },
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);
    return <div data-testid='clerk-sign-in' />;
  },
  GoogleOneTap: (props: unknown) => {
    googleOneTapMock(props);
    return <div data-testid='google-one-tap' />;
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
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
  afterEach(() => {
    delete document.documentElement.dataset.e2eMode;
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    clerkSignInMock.mockReset();
    googleOneTapMock.mockReset();
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

  it('preserves redirect_url when linking from sign in to sign up', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signUpUrl: '/signup?redirect_url=%2Fonboarding',
      })
    );
  });

  it('renders Google One Tap with dashboard and onboarding redirects by default', async () => {
    render(<SignInPage />);

    await waitFor(() => {
      expect(googleOneTapMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('google-one-tap')).toBeInTheDocument();
    expect(googleOneTapMock).toHaveBeenCalledWith({
      signInForceRedirectUrl: APP_ROUTES.DASHBOARD,
      signUpForceRedirectUrl: APP_ROUTES.ONBOARDING,
    });
  });

  it('preserves a safe redirect_url for Google One Tap', async () => {
    searchParamsState.value =
      'redirect_url=%2Fapp%2Fsettings%2Faccount%3Ftab%3Dbilling';

    render(<SignInPage />);

    await waitFor(() => {
      expect(googleOneTapMock).toHaveBeenCalledTimes(1);
    });

    expect(googleOneTapMock).toHaveBeenCalledWith({
      signInForceRedirectUrl: '/app/settings/account?tab=billing',
      signUpForceRedirectUrl: '/app/settings/account?tab=billing',
    });
  });

  it('drops an unsafe redirect_url for Google One Tap', async () => {
    searchParamsState.value = 'redirect_url=https%3A%2F%2Fevil.example';

    render(<SignInPage />);

    await waitFor(() => {
      expect(googleOneTapMock).toHaveBeenCalledTimes(1);
    });

    expect(googleOneTapMock).toHaveBeenCalledWith({
      signInForceRedirectUrl: APP_ROUTES.DASHBOARD,
      signUpForceRedirectUrl: APP_ROUTES.ONBOARDING,
    });
  });

  it('does not render Google One Tap when disabled for automation or mock auth', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ONE_TAP_DISABLED', '1');

    const { rerender } = render(<SignInPage />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });
    expect(googleOneTapMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    clerkSignInMock.mockReset();
    rerender(<SignInPage />);
    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });
    expect(googleOneTapMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_CLERK_MOCK', '1');
    clerkSignInMock.mockReset();
    rerender(<SignInPage />);
    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });
    expect(googleOneTapMock).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    document.documentElement.dataset.e2eMode = '1';
    clerkSignInMock.mockReset();
    rerender(<SignInPage />);
    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });
    expect(googleOneTapMock).not.toHaveBeenCalled();
  });
});
