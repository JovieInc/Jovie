import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clearSignupClaimValueMock,
  clerkSignUpMock,
  fetchMock,
  persistSignupClaimValueMock,
  routerPrefetchMock,
  searchParamsState,
  setPlanIntentMock,
  trackMock,
  validatePlanMock,
} = vi.hoisted(() => ({
  clearSignupClaimValueMock: vi.fn(),
  clerkSignUpMock: vi.fn(),
  fetchMock: vi.fn(),
  persistSignupClaimValueMock: vi.fn(),
  routerPrefetchMock: vi.fn(),
  searchParamsState: { value: '' },
  setPlanIntentMock: vi.fn(),
  trackMock: vi.fn(),
  validatePlanMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: unknown) => {
    clerkSignUpMock(props);
    return <div data-testid='clerk-sign-up' />;
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

vi.mock('@/lib/analytics', () => ({
  track: trackMock,
}));

vi.mock('@/lib/auth/plan-intent', () => ({
  setPlanIntent: setPlanIntentMock,
  validatePlan: validatePlanMock,
}));

vi.mock('@/lib/auth/signup-claim-storage', () => ({
  clearSignupClaimValue: clearSignupClaimValueMock,
  persistSignupClaimValue: persistSignupClaimValueMock,
  SIGNUP_ARTIST_NAME_KEY: 'signup_artist_name',
  SIGNUP_SPOTIFY_EXPECTED_KEY: 'signup_spotify_expected',
  SIGNUP_SPOTIFY_URL_KEY: 'signup_spotify_url',
}));

global.fetch = fetchMock as unknown as typeof fetch;

import { APP_ROUTES } from '@/constants/routes';
import { SignUpPageClient } from '../../../app/(auth)/signup/SignUpPageClient';

describe('signup page', () => {
  beforeEach(() => {
    clearSignupClaimValueMock.mockReset();
    clerkSignUpMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    });
    persistSignupClaimValueMock.mockReset();
    routerPrefetchMock.mockReset();
    searchParamsState.value = '';
    setPlanIntentMock.mockReset();
    sessionStorage.clear();
    trackMock.mockReset();
    validatePlanMock.mockReset();
    validatePlanMock.mockImplementation(plan => plan);
    globalThis.history.replaceState(null, '', '/signup');
  });

  it('renders Clerk SignUp with the expected auth props and legal links', async () => {
    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(clerkSignUpMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    expect(routerPrefetchMock).toHaveBeenCalledWith(APP_ROUTES.SIGNIN);
    expect(clerkSignUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'hash',
        oauthFlow: 'redirect',
        signInUrl: APP_ROUTES.SIGNIN,
        fallbackRedirectUrl: APP_ROUTES.ONBOARDING,
      })
    );
    expect(
      screen.getByRole('link', { name: /terms of service/i })
    ).toHaveAttribute('href', APP_ROUTES.LEGAL_TERMS);
    expect(
      screen.getByRole('link', { name: /privacy policy/i })
    ).toHaveAttribute('href', APP_ROUTES.LEGAL_PRIVACY);
  });

  it('shows handle availability without writing pending claim session state', async () => {
    searchParamsState.value = 'handle=TestHandle';

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/handle/check?handle=testhandle',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    expect(
      await screen.findByText('@testhandle is available. Sign up to claim it.')
    ).toBeInTheDocument();
    expect(sessionStorage.getItem('pendingClaim')).toBeNull();
  });

  it('shows the oauth compatibility banner and removes only oauth_error from the URL', async () => {
    searchParamsState.value =
      'oauth_error=account_exists&plan=founding&redirect_url=%2Fapp';
    globalThis.history.replaceState(
      null,
      '',
      '/signup?oauth_error=account_exists&plan=founding&redirect_url=%2Fapp'
    );
    const replaceStateSpy = vi.spyOn(globalThis.history, 'replaceState');

    render(<SignUpPageClient />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'An account with this email already exists. Try signing in instead.'
    );
    expect(
      screen.getByRole('link', { name: 'Sign in instead' })
    ).toHaveAttribute('href', '/signin?redirect_url=%2Fapp');

    await waitFor(() => {
      expect(globalThis.location.search).toBe(
        '?plan=founding&redirect_url=%2Fapp'
      );
    });

    expect(replaceStateSpy).toHaveBeenCalledWith(
      globalThis.history.state,
      '',
      '/signup?plan=founding&redirect_url=%2Fapp'
    );

    replaceStateSpy.mockRestore();
  });

  it('preserves redirect_url on the Clerk sign-in footer link', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(clerkSignUpMock).toHaveBeenCalledTimes(1);
    });

    expect(clerkSignUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signInUrl: '/signin?redirect_url=%2Fonboarding',
      })
    );
  });

  it('ignores invalid plan values and does not track plan intent', async () => {
    searchParamsState.value = 'plan=not-a-plan&handle=TestHandle';
    validatePlanMock.mockReturnValue(null);

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(clerkSignUpMock).toHaveBeenCalledTimes(1);
    });

    expect(validatePlanMock).toHaveBeenCalledWith('not-a-plan');
    expect(setPlanIntentMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not crash when sessionStorage writes fail', async () => {
    searchParamsState.value = 'handle=QuotaCase';
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded');
      });

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(clerkSignUpMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/handle/check?handle=quotacase',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
    setItemSpy.mockRestore();
  });

  it('renders the taken-handle state when the requested handle is unavailable', async () => {
    searchParamsState.value = 'handle=TakenHandle';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false }),
    });

    render(<SignUpPageClient />);

    expect(
      await screen.findByText(
        '@takenhandle is already taken. You can pick another handle after signing up.'
      )
    ).toBeInTheDocument();
  });

  it('renders the fallback state when handle availability lookup fails', async () => {
    searchParamsState.value = 'handle=BrokenHandle';
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<SignUpPageClient />);

    expect(
      await screen.findByText(
        "Couldn't check if @brokenhandle is available. You can still sign up and choose a handle."
      )
    ).toBeInTheDocument();
  });

  it('shows the access denied oauth banner without losing redirect params', async () => {
    searchParamsState.value =
      'oauth_error=access_denied&redirect_url=%2Fonboarding%3Fhandle%3Dartist';
    globalThis.history.replaceState(
      null,
      '',
      '/signup?oauth_error=access_denied&redirect_url=%2Fonboarding%3Fhandle%3Dartist'
    );

    render(<SignUpPageClient />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Required permissions were not granted. Please try again and accept all permissions.'
    );

    await waitFor(() => {
      expect(globalThis.location.search).toBe(
        '?redirect_url=%2Fonboarding%3Fhandle%3Dartist'
      );
    });

    expect(clerkSignUpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signInUrl: '/signin?redirect_url=%2Fonboarding%3Fhandle%3Dartist',
      })
    );
  });
});
