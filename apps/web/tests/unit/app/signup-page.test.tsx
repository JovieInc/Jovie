import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('signup page', () => {
  beforeEach(() => {
    authShellMock.mockReset();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    clearSignupClaimValueMock.mockReset();
    authLayoutMock.mockReset();
    fetchMock.mockReset();
    replaceMock.mockReset();
    fetchMock.mockImplementation(async () =>
      Response.json({ available: true })
    );
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

  it.each([
    [
      'error=oauth_failed',
      'Something went wrong with sign-up. Please try again.',
    ],
    [
      'error=access_denied',
      'Sign-in was cancelled. Try again, or pick a different method.',
    ],
    [
      'error=account_exists',
      'An account with this email already exists. Try signing in instead.',
    ],
    [
      'error=unknown_provider_error',
      'Something went wrong with sign-up. Please try again.',
    ],
    [
      'error=&oauth_error=access_denied',
      'Sign-in was cancelled. Try again, or pick a different method.',
    ],
    [
      'error=access_denied&oauth_error=account_exists',
      'Sign-in was cancelled. Try again, or pick a different method.',
    ],
    [
      'error=access_denied&error=account_exists',
      'An account with this email already exists. Try signing in instead.',
    ],
    [
      'error=oauth_failed&error=access_denied',
      'Sign-in was cancelled. Try again, or pick a different method.',
    ],
    [
      'error=oauth_failed&error=account_exists',
      'An account with this email already exists. Try signing in instead.',
    ],
    [
      'error=oauth_failed&error=',
      'Something went wrong with sign-up. Please try again.',
    ],
  ])(
    'shows signup return feedback for %s and consumes only the error parameters',
    async (error, message) => {
      const context = 'handle=TestHandle&plan=pro&redirect_url=%2Fstart';
      searchParamsState.value = `${error}&${context}`;
      globalThis.history.replaceState(
        { returnState: 'preserved' },
        '',
        `/signup?${searchParamsState.value}#recovery`
      );

      render(<SignUpPageClient />);

      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByRole('alert')).toBeVisible();
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      if (message.includes('already exists')) {
        expect(
          screen.getByRole('link', { name: 'Sign in instead' })
        ).toHaveAttribute(
          'href',
          '/signin?handle=testhandle&redirect_url=%2Fstart&plan=pro'
        );
      }
      await waitFor(() => {
        expect(globalThis.location.search).toBe(`?${context}`);
      });
      expect(globalThis.location.hash).toBe('#recovery');
      expect(globalThis.history.state).toEqual({ returnState: 'preserved' });
      expect(authShellMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'sign-up',
          oppositeModeUrl:
            '/signin?handle=testhandle&redirect_url=%2Fstart&plan=pro',
          fallbackRedirectUrl: '/start',
        })
      );
    }
  );

  it.each(['', 'error=&oauth_error='])(
    'does not show return feedback without an error (%s)',
    params => {
      searchParamsState.value = params;

      render(<SignUpPageClient />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );

  it.each(['desktop_return', 'mobile_return'])(
    'preserves %s in canonical account recovery',
    returnParam => {
      searchParamsState.value = `error=account_exists&email=fixture%40example.com&${returnParam}=%2Fapp%2Fsettings`;
      globalThis.history.replaceState(
        null,
        '',
        `/signup?${searchParamsState.value}`
      );

      render(<SignUpPageClient />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'An account for fixture@example.com already exists. Try signing in instead.'
      );
      expect(
        screen.getByRole('link', { name: 'Sign in instead' })
      ).toHaveAttribute('href', `/signin?${returnParam}=%2Fapp%2Fsettings`);
    }
  );

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
    fetchMock.mockResolvedValueOnce(Response.json({ available: false }));

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

  describe('truthful handle availability', () => {
    const recovery =
      "Couldn't check if @testhandle is available. You can still sign up and choose a handle.";

    it.each(['@Motion', ' Motion ', ' @Motion '])(
      'accepts the canonical response for supported input %j',
      async input => {
        searchParamsState.value = new URLSearchParams({
          handle: input,
        }).toString();
        fetchMock.mockResolvedValueOnce(
          Response.json({
            available: true,
            reason: 'available',
            handle: 'motion',
          })
        );
        render(<SignUpPageClient />);
        await waitFor(() =>
          expect(screen.getByRole('status')).not.toHaveTextContent(
            'Checking if'
          )
        );
        expect(screen.getByRole('status')).toHaveTextContent(
          '@motion is available. Sign up to claim it.'
        );
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/handle/check?handle=motion',
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
      }
    );

    it.each([
      { name: 'HTTP 500 JSON', status: 500, body: { error: 'Unavailable' } },
      { name: 'HTTP 429 JSON', status: 429, body: { error: 'Rate limited' } },
      { name: 'empty successful object', status: 200, body: {} },
      {
        name: 'canonical HTTP 500',
        status: 500,
        body: { available: false, reason: 'error' },
      },
      {
        name: 'canonical HTTP 429',
        status: 429,
        body: { available: false, reason: 'error', error: 'Rate limited' },
      },
      {
        name: 'HTTP error claiming availability',
        status: 503,
        body: { available: true },
      },
      {
        name: 'invalid format',
        status: 400,
        body: { available: false, reason: 'invalid_format' },
      },
      {
        name: 'reserved handle',
        status: 400,
        body: { available: false, reason: 'reserved' },
      },
      {
        name: 'successful error reason',
        status: 200,
        body: { available: false, reason: 'error' },
      },
      {
        name: 'successful unknown reason',
        status: 200,
        body: { available: false, reason: 'unknown' },
      },
      {
        name: 'completed checking reason',
        status: 200,
        body: { available: false, reason: 'checking' },
      },
      {
        name: 'unrecognized reason',
        status: 200,
        body: { available: false, reason: 'unrecognized' },
      },
      {
        name: 'null reason',
        status: 200,
        body: { available: false, reason: null },
      },
      { name: 'string false', status: 200, body: { available: 'false' } },
      { name: 'string true', status: 200, body: { available: 'true' } },
      { name: 'numeric zero', status: 200, body: { available: 0 } },
      { name: 'numeric one', status: 200, body: { available: 1 } },
      { name: 'null availability', status: 200, body: { available: null } },
      { name: 'null body', status: 200, body: null },
      { name: 'array body', status: 200, body: [] },
      { name: 'string body', status: 200, body: 'available' },
      { name: 'boolean body', status: 200, body: true },
      {
        name: 'available and taken conflict',
        status: 200,
        body: { available: true, reason: 'taken' },
      },
      {
        name: 'taken and available conflict',
        status: 200,
        body: { available: false, reason: 'available' },
      },
      {
        name: 'available and error conflict',
        status: 200,
        body: { available: true, reason: 'error' },
      },
      {
        name: 'available with reported error',
        status: 200,
        body: { available: true, error: 'Unavailable' },
      },
      {
        name: 'taken with reported error',
        status: 200,
        body: { available: false, error: 'Unavailable' },
      },
      {
        name: 'invalid error type',
        status: 200,
        body: { available: false, error: null },
      },
      {
        name: 'different echoed handle',
        status: 200,
        body: { available: true, handle: 'anotherhandle' },
      },
      {
        name: 'invalid echoed handle',
        status: 200,
        body: { available: true, handle: null },
      },
    ])(
      'uses recovery for $name instead of claiming allocation',
      async ({ status, body }) => {
        searchParamsState.value = 'handle=TestHandle';
        fetchMock.mockResolvedValueOnce(Response.json(body, { status }));

        render(<SignUpPageClient />);

        await waitFor(() =>
          expect(screen.getByRole('status')).not.toHaveTextContent(
            'Checking if'
          )
        );
        expect(screen.getByRole('status')).toHaveTextContent(recovery);
        expect(screen.getAllByRole('status')).toHaveLength(1);
        expect(screen.getByRole('status')).toHaveAttribute(
          'aria-live',
          'polite'
        );
        expect(sessionStorage.getItem('pendingClaim')).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    );

    it.each([
      {
        name: 'canonical available',
        body: { available: true, reason: 'available', handle: 'testhandle' },
        expected: '@testhandle is available. Sign up to claim it.',
      },
      {
        name: 'canonical taken with alternatives',
        body: {
          available: false,
          reason: 'taken',
          handle: 'TESTHANDLE',
          suggestedAlternatives: ['anotherhandle'],
        },
        expected: '@testhandle is already taken.',
      },
      {
        name: 'boolean-only available with extra metadata',
        body: { available: true, metadata: { cached: true } },
        expected: '@testhandle is available. Sign up to claim it.',
      },
      {
        name: 'boolean-only taken with empty error',
        body: { available: false, error: '' },
        expected: '@testhandle is already taken.',
      },
    ])('preserves $name compatibility', async ({ body, expected }) => {
      searchParamsState.value = 'handle=TestHandle';
      fetchMock.mockResolvedValueOnce(Response.json(body));
      render(<SignUpPageClient />);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(expected)
      );
    });

    it.each(['<html>Unavailable</html>', '', '{'])(
      'recovers from an unparseable successful response %j',
      async body => {
        searchParamsState.value = 'handle=TestHandle';
        fetchMock.mockResolvedValueOnce(new Response(body));
        render(<SignUpPageClient />);
        await waitFor(() =>
          expect(screen.getByRole('status')).toHaveTextContent(recovery)
        );
      }
    );

    it.each(['response', 'error'] as const)(
      'ignores an old %s after the new handle succeeds',
      async outcome => {
        const oldRequest = deferred<Response>();
        fetchMock.mockReturnValueOnce(oldRequest.promise);
        searchParamsState.value = 'handle=OldHandle';
        const { rerender } = render(<SignUpPageClient />);
        const oldSignal = fetchMock.mock.calls[0]?.[1].signal as AbortSignal;
        searchParamsState.value = 'handle=TestHandle';
        rerender(<SignUpPageClient />);
        await waitFor(() =>
          expect(screen.getByRole('status')).toHaveTextContent(
            '@testhandle is available.'
          )
        );
        expect(oldSignal.aborted).toBe(true);
        await act(async () => {
          if (outcome === 'response')
            oldRequest.resolve(Response.json({ available: false }));
          else oldRequest.reject(new Error('obsolete failure'));
        });
        expect(screen.getByRole('status')).toHaveTextContent(
          '@testhandle is available.'
        );
        expect(screen.getByRole('status')).not.toHaveTextContent(
          'already taken'
        );
        expect(screen.getByRole('status')).not.toHaveTextContent(
          "Couldn't check"
        );
      }
    );

    it('does not settle a new handle from an old response that resolves first', async () => {
      const oldRequest = deferred<Response>();
      const currentRequest = deferred<Response>();
      fetchMock
        .mockReturnValueOnce(oldRequest.promise)
        .mockReturnValueOnce(currentRequest.promise);
      searchParamsState.value = 'handle=OldHandle';
      const { rerender } = render(<SignUpPageClient />);
      searchParamsState.value = 'handle=TestHandle';
      rerender(<SignUpPageClient />);
      await act(async () =>
        oldRequest.resolve(Response.json({ available: false }))
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Checking if @testhandle is available...'
      );
      await act(async () =>
        currentRequest.resolve(Response.json({ available: true }))
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        '@testhandle is available.'
      );
    });

    it('ignores a stale body after response headers arrive before navigation', async () => {
      const parsedBody = deferred<unknown>();
      const oldResponse = Response.json({ available: false });
      const jsonSpy = vi
        .spyOn(oldResponse, 'json')
        .mockReturnValue(parsedBody.promise);
      fetchMock.mockResolvedValueOnce(oldResponse);
      searchParamsState.value = 'handle=OldHandle';
      const { rerender } = render(<SignUpPageClient />);
      await waitFor(() => expect(jsonSpy).toHaveBeenCalled());
      searchParamsState.value = 'handle=TestHandle';
      rerender(<SignUpPageClient />);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          '@testhandle is available.'
        )
      );
      await act(async () => parsedBody.resolve({ available: false }));
      expect(screen.getByRole('status')).toHaveTextContent(
        '@testhandle is available.'
      );
    });

    it.each(['', 'handle=ab'])(
      'clears prior status without a new lookup for %j',
      async query => {
        searchParamsState.value = 'handle=TestHandle';
        const { rerender } = render(<SignUpPageClient />);
        await waitFor(() =>
          expect(screen.getByRole('status')).toHaveTextContent(
            '@testhandle is available.'
          )
        );
        searchParamsState.value = query;
        rerender(<SignUpPageClient />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
      }
    );

    it('aborts on unmount and does not affect a remounted lookup', async () => {
      const oldRequest = deferred<Response>();
      fetchMock.mockReturnValueOnce(oldRequest.promise);
      searchParamsState.value = 'handle=TestHandle';
      const first = render(<SignUpPageClient />);
      const signal = fetchMock.mock.calls[0]?.[1].signal as AbortSignal;
      first.unmount();
      expect(signal.aborted).toBe(true);
      render(<SignUpPageClient />);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          '@testhandle is available.'
        )
      );
      await act(async () =>
        oldRequest.reject(new DOMException('Aborted', 'AbortError'))
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        '@testhandle is available.'
      );
    });

    it('recovers on remount after an inconclusive lookup', async () => {
      searchParamsState.value = 'handle=TestHandle';
      fetchMock.mockResolvedValueOnce(Response.json({}, { status: 500 }));
      const first = render(<SignUpPageClient />);
      await waitFor(() =>
        expect(screen.getByRole('status')).not.toHaveTextContent('Checking if')
      );
      expect(screen.getByRole('status')).toHaveTextContent(recovery);
      first.unmount();
      render(<SignUpPageClient />);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          '@testhandle is available.'
        )
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
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
