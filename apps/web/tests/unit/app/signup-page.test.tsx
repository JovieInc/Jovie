import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authShellMock,
  authState,
  clearSignupClaimValueMock,
  authLayoutMock,
  fetchMock,
  persistSignupClaimValueMock,
  replaceMock,
  routerPrefetchMock,
  searchParamsState,
  setPlanIntentMock,
  trackMock,
  validatePlanMock,
} = vi.hoisted(() => ({
  authShellMock: vi.fn(),
  authState: {
    isLoaded: true,
    isSignedIn: false,
  },
  clearSignupClaimValueMock: vi.fn(),
  authLayoutMock: vi.fn(),
  fetchMock: vi.fn(),
  persistSignupClaimValueMock: vi.fn(),
  replaceMock: vi.fn(),
  routerPrefetchMock: vi.fn(),
  searchParamsState: { value: '' },
  setPlanIntentMock: vi.fn(),
  trackMock: vi.fn(),
  validatePlanMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => authState,
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
    AuthOfferSummary: () =>
      reactModule.createElement('div', { 'data-testid': 'auth-offer-summary' }),
  };
});

vi.mock('@/lib/analytics', () => ({
  track: trackMock,
}));

vi.mock('@/lib/auth/plan-intent', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/auth/plan-intent')>()),
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
    authShellMock.mockReset();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    clearSignupClaimValueMock.mockReset();
    authLayoutMock.mockReset();
    fetchMock.mockReset();
    replaceMock.mockReset();
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
    validatePlanMock.mockImplementation(plan =>
      ['free', 'pro', 'max', 'team', 'enterprise'].includes(plan) ? plan : null
    );
    document.cookie =
      '__client_uat=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    globalThis.history.replaceState(null, '', '/signup');
  });

  it('does not overwrite offer extras while capturing the signup claim', () => {
    searchParamsState.value = 'plan=pro&interval=monthly&artist=Tim%20White';
    render(<SignUpPageClient />);
    expect(setPlanIntentMock).toHaveBeenCalledWith('pro', {
      interval: 'monthly',
      artist: 'Tim White',
    });
    expect(persistSignupClaimValueMock).toHaveBeenCalledWith(
      'signup_artist_name',
      'Tim White',
      expect.any(Number)
    );
  });

  it('keeps a recovered artist claim when signup resumes without query context', () => {
    render(<SignUpPageClient />);
    expect(clearSignupClaimValueMock).not.toHaveBeenCalledWith(
      'signup_artist_name'
    );
  });

  it('renders AuthShell with the expected auth props', () => {
    render(<SignUpPageClient />);

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(authLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        formTitle: 'Continue to Jovie',
        showFormTitle: false,
        showFooterPrompt: false,
        layoutVariant: 'stack',
      })
    );
    expect(authLayoutMock.mock.calls[0]?.[0].chrome).not.toBe('splash-b');
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

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/handle/check?handle=testhandle',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('@testhandle is available. Sign up to claim it.')
      ).toBeVisible();
    });
    expect(sessionStorage.getItem('pendingClaim')).toBeNull();
  });

  it('reserves the handle status slot in server markup before hydration', () => {
    searchParamsState.value = 'handle=LongArtistNameForFocus';

    const markup = renderToString(<SignUpPageClient />);

    expect(markup).toContain('data-testid="signup-handle-status"');
    expect(markup).toContain('data-availability-state="initial"');
    expect(markup).toContain('aria-live="polite"');
  });

  it('keeps one accessible status region from checking through completion', async () => {
    searchParamsState.value = 'handle=StableArtist';
    let resolveFetch!: (value: {
      json: () => Promise<{ available: boolean }>;
    }) => void;
    fetchMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveFetch = resolve;
      })
    );

    render(<SignUpPageClient />);

    const status = screen.getByTestId('signup-handle-status');
    await waitFor(() => {
      expect(status).toHaveAttribute('data-availability-state', 'checking');
    });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByText('Checking if @stableartist is available...')
    ).toBeInTheDocument();

    resolveFetch({ json: async () => ({ available: true }) });

    await waitFor(() => {
      expect(status).toHaveAttribute('data-availability-state', 'available');
    });
    expect(screen.getByTestId('signup-handle-status')).toBe(status);
    expect(status).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.getByText('@stableartist is available. Sign up to claim it.')
    ).toBeVisible();
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

  it('preserves desktop_return on the oauth compatibility banner sign-in link', async () => {
    searchParamsState.value =
      'oauth_error=account_exists&desktop_return=%2Fapp%2Fsettings';
    globalThis.history.replaceState(
      null,
      '',
      '/signup?oauth_error=account_exists&desktop_return=%2Fapp%2Fsettings'
    );

    render(<SignUpPageClient />);

    expect(
      screen.getByRole('link', { name: 'Sign in instead' })
    ).toHaveAttribute('href', '/signin?desktop_return=%2Fapp%2Fsettings');
  });

  it('preserves redirect_url on the Clerk sign-in footer link', async () => {
    searchParamsState.value = 'redirect_url=%2Fonboarding';

    render(<SignUpPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackRedirectUrl: '/onboarding',
        oppositeModeUrl: '/signin?redirect_url=%2Fonboarding',
      })
    );
  });

  it('uses desktop_return for desktop browser auth fallback and sign-in link', async () => {
    searchParamsState.value = 'desktop_return=%2Fstart%3Fintent_id%3Dabc';

    render(<SignUpPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?desktop_return=%2Fstart%3Fintent_id%3Dabc',
        fallbackRedirectUrl: '/auth-return?route=%2Fstart%3Fintent_id%3Dabc',
      })
    );
  });

  it('uses mobile_return for mobile browser auth fallback and sign-in link', async () => {
    searchParamsState.value = 'mobile_return=%2Fapp';

    render(<SignUpPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?mobile_return=%2Fapp',
        fallbackRedirectUrl: '/mobile-auth-return?route=%2Fapp',
      })
    );
  });

  it('records interval on plan intent and hides the offer recap while the flag is off', () => {
    searchParamsState.value =
      'plan=pro&interval=year&desktop_return=%2Fapp&mobile_return=%2Fstart';

    render(<SignUpPageClient />);

    expect(trackMock).toHaveBeenCalledWith('plan_intent_captured', {
      plan: 'pro',
      interval: 'year',
      source: 'pricing',
    });
    expect(screen.queryByTestId('auth-offer-summary')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Start your 14-day Artist Presence trial')
    ).not.toBeInTheDocument();
  });

  it('forwards plan and interval on the desktop auth-return link', () => {
    searchParamsState.value = 'plan=pro&interval=year&desktop_return=%2Fapp';

    render(<SignUpPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?plan=pro&interval=year&desktop_return=%2Fapp',
      })
    );
  });

  it('forwards plan and interval on the mobile auth-return link', () => {
    searchParamsState.value = 'plan=pro&interval=year&mobile_return=%2Fapp';

    render(<SignUpPageClient />);

    expect(authShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oppositeModeUrl: '/signin?plan=pro&interval=year&mobile_return=%2Fapp',
      })
    );
  });

  it('shows the offer recap only when the page enables it', () => {
    searchParamsState.value = 'plan=pro&interval=month';

    render(<SignUpPageClient showOfferSummary />);

    expect(screen.getByTestId('auth-offer-summary')).toBeInTheDocument();
    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
  });

  it('ignores invalid plan values and does not track plan intent', async () => {
    searchParamsState.value = 'plan=not-a-plan&handle=TestHandle';
    validatePlanMock.mockReturnValue(null);

    render(<SignUpPageClient />);

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

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(
        screen.getByText(
          '@takenhandle is already taken. You can pick another handle after signing up.'
        )
      ).toBeVisible();
    });
  });

  it('renders the fallback state when handle availability lookup fails', async () => {
    searchParamsState.value = 'handle=BrokenHandle';
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<SignUpPageClient />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Couldn't check if @brokenhandle is available. You can still sign up and choose a handle."
        )
      ).toBeVisible();
    });
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

    render(<SignUpPageClient />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('artist@example.com');
    expect(alert).toHaveTextContent('already exists');
  });

  it('redirects signed-in visitors instead of leaving a blank auth card', async () => {
    authState.isSignedIn = true;

    const { queryByTestId } = render(<SignUpPageClient />);

    expect(queryByTestId('auth-shell')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(APP_ROUTES.DASHBOARD);
    });
  });

  it('keeps email/SSO controls after a second signed-out mount', () => {
    const first = render(<SignUpPageClient />);
    expect(first.getByTestId('auth-shell')).toBeInTheDocument();
    first.unmount();

    const second = render(<SignUpPageClient />);
    expect(second.getByTestId('auth-shell')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
