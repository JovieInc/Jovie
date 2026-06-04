import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authShellMock,
  clearSignupClaimValueMock,
  authLayoutMock,
  fetchMock,
  persistSignupClaimValueMock,
  routerPrefetchMock,
  searchParamsState,
  setPlanIntentMock,
  trackMock,
  validatePlanMock,
} = vi.hoisted(() => ({
  authShellMock: vi.fn(),
  clearSignupClaimValueMock: vi.fn(),
  authLayoutMock: vi.fn(),
  fetchMock: vi.fn(),
  persistSignupClaimValueMock: vi.fn(),
  routerPrefetchMock: vi.fn(),
  searchParamsState: { value: '' },
  setPlanIntentMock: vi.fn(),
  trackMock: vi.fn(),
  validatePlanMock: vi.fn(),
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
    AuthShell: (props: Record<string, unknown>) => {
      authShellMock(props);
      return reactModule.createElement('div', { 'data-testid': 'auth-shell' });
    },
  };
});

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
import SignUpPage from '../../../app/(auth)/signup/page';

describe('signup page', () => {
  beforeEach(() => {
    authShellMock.mockReset();
    clearSignupClaimValueMock.mockReset();
    authLayoutMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
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

  it('renders AuthShell with the expected auth props', () => {
    render(<SignUpPage />);

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(authLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: 'Request access',
        showFormTitle: false,
        showFooterPrompt: false,
        layoutVariant: 'split',
      })
    );
    expect(
      screen.queryByText('Start your private launch request.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Don't have access?")).not.toBeInTheDocument();
    expect(routerPrefetchMock).toHaveBeenCalledWith(APP_ROUTES.SIGNIN);
    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        forceOppositeModeHardNavigation: true,
        fallbackRedirectUrl: undefined,
        mode: 'sign-up',
        oppositeModeUrl: APP_ROUTES.SIGNIN,
      })
    );
  });

  it('shows handle availability without writing pending claim session state', async () => {
    searchParamsState.value = 'handle=TestHandle';

    render(<SignUpPage />);

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

    render(<SignUpPage />);

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

  it('preserves desktop_return on the oauth compatibility banner sign-in link', async () => {
    searchParamsState.value =
      'oauth_error=account_exists&desktop_return=%2Fapp%2Fsettings';
    globalThis.history.replaceState(
      null,
      '',
      '/signup?oauth_error=account_exists&desktop_return=%2Fapp%2Fsettings'
    );

    render(<SignUpPage />);

    expect(
      screen.getByRole('link', { name: 'Sign in instead' })
    ).toHaveAttribute('href', '/signin?desktop_return=%2Fapp%2Fsettings');
  });

  it('preserves redirect_url on the Clerk sign-in footer link', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignUpPage />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackRedirectUrl: '/onboarding',
        oppositeModeUrl: '/signin?redirect_url=%2Fonboarding',
      })
    );
  });

  it('uses desktop_return for desktop browser auth fallback and sign-in link', async () => {
    searchParamsState.value = 'desktop_return=%2Fstart%3Fintent_id%3Dabc';

    render(<SignUpPage />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?desktop_return=%2Fstart%3Fintent_id%3Dabc',
        fallbackRedirectUrl: '/auth-return?route=%2Fstart%3Fintent_id%3Dabc',
      })
    );
  });

  it('uses mobile_return for mobile browser auth fallback and sign-in link', async () => {
    searchParamsState.value = 'mobile_return=%2Fapp';

    render(<SignUpPage />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?mobile_return=%2Fapp',
        fallbackRedirectUrl: '/mobile-auth-return?route=%2Fapp',
      })
    );
  });

  it('ignores invalid plan values and does not track plan intent', async () => {
    searchParamsState.value = 'plan=not-a-plan&handle=TestHandle';
    validatePlanMock.mockReturnValue(null);

    render(<SignUpPage />);

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

    render(<SignUpPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/handle/check?handle=quotacase',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    setItemSpy.mockRestore();
  });

  it('renders the taken-handle state when the requested handle is unavailable', async () => {
    searchParamsState.value = 'handle=TakenHandle';
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ available: false }),
    });

    render(<SignUpPage />);

    expect(
      await screen.findByText(
        '@takenhandle is already taken. You can pick another handle after signing up.'
      )
    ).toBeInTheDocument();
  });

  it('renders the fallback state when handle availability lookup fails', async () => {
    searchParamsState.value = 'handle=BrokenHandle';
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<SignUpPage />);

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

    render(<SignUpPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sign-in was cancelled. Try again, or pick a different method.'
    );

    await waitFor(() => {
      expect(globalThis.location.search).toBe(
        '?redirect_url=%2Fonboarding%3Fhandle%3Dartist'
      );
    });

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?redirect_url=%2Fonboarding%3Fhandle%3Dartist',
      })
    );
  });

  it('interpolates the conflicting email into the account_exists banner when ?email= is present', async () => {
    searchParamsState.value =
      'oauth_error=account_exists&email=artist%40example.com';
    globalThis.history.replaceState(
      null,
      '',
      '/signup?oauth_error=account_exists&email=artist%40example.com'
    );

    render(<SignUpPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('artist@example.com');
    expect(alert).toHaveTextContent('already exists');
  });
});
