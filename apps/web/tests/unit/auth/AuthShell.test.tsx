import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  providerEnabledState,
  oneTapConfiguredState,
  oneTapMock,
  searchParamsState,
  signInSocialMock,
  sendOtpMock,
} = vi.hoisted(() => ({
  authState: {
    isLoaded: true,
    isSignedIn: false,
  },
  providerEnabledState: {
    google: true,
    apple: true,
  },
  oneTapConfiguredState: { value: false },
  oneTapMock: vi.fn(),
  searchParamsState: { value: '' },
  signInSocialMock: vi.fn(),
  sendOtpMock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: {
      social: signInSocialMock,
      emailOtp: vi.fn(),
    },
    emailOtp: {
      sendVerificationOtp: sendOtpMock,
    },
    oneTap: oneTapMock,
  },
  isGoogleOneTapConfigured: () => oneTapConfiguredState.value,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/lib/auth/oauth-providers', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/auth/oauth-providers')
  >('@/lib/auth/oauth-providers');
  return {
    ...actual,
    isOAuthProviderEnabled: (
      provider: keyof typeof providerEnabledState | string
    ) =>
      provider in providerEnabledState
        ? providerEnabledState[provider as keyof typeof providerEnabledState]
        : false,
    getEnabledAuthOAuthProviders: () =>
      actual.AUTH_OAUTH_PROVIDER_ORDER.filter(
        provider => providerEnabledState[provider]
      ),
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { AuthShell } from '@/components/features/auth/AuthShell';

describe('AuthShell — Better Auth SSO + email-code contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = false;
    providerEnabledState.google = true;
    providerEnabledState.apple = true;
    oneTapConfiguredState.value = false;
    searchParamsState.value = '';
    signInSocialMock.mockResolvedValue(undefined);
    sendOtpMock.mockResolvedValue({ data: {} });
    oneTapMock.mockResolvedValue(undefined);
  });

  it('is ready at first paint without a Clerk-loaded gate', () => {
    const { container } = render(<AuthShell mode='sign-in' />);
    expect(
      container.querySelector('[data-auth-shell-ready="true"]')
    ).not.toBeNull();
  });

  it('keeps OAuth buttons disabled until client hydration attaches handlers', async () => {
    const serverMarkup = renderToStaticMarkup(<AuthShell mode='sign-in' />);
    expect(serverMarkup).toContain('data-auth-shell-hydrated="false"');
    // SSR emits `disabled=""` before the provider slot attribute.
    expect(serverMarkup).toMatch(
      /disabled=""[^>]*data-auth-provider-slot="google"/
    );

    const { container } = render(<AuthShell mode='sign-in' />);
    await waitFor(() => {
      expect(
        container.querySelector('[data-auth-shell-hydrated="true"]')
      ).not.toBeNull();
    });
    expect(
      await screen.findByRole('button', { name: /google/i })
    ).toBeEnabled();
  });

  it('does not call the proxy-backed One Tap route when the plugin is unconfigured', async () => {
    render(<AuthShell mode='sign-up' />);

    await waitFor(() => {
      expect(oneTapMock).not.toHaveBeenCalled();
    });
  });

  it('calls One Tap only when its client id configured the plugin', async () => {
    oneTapConfiguredState.value = true;
    render(<AuthShell mode='sign-up' />);

    await waitFor(() => {
      expect(oneTapMock).toHaveBeenCalledWith({
        callbackURL: '/signup',
        context: 'signup',
      });
    });
  });

  it('keeps the standard Google OAuth button available when One Tap declines', async () => {
    oneTapConfiguredState.value = true;
    oneTapMock.mockRejectedValueOnce(new Error('Google One Tap unavailable'));

    render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(oneTapMock).toHaveBeenCalledWith({
        callbackURL: '/signin',
        context: 'signin',
      });
    });

    const google = await screen.findByRole('button', { name: /google/i });
    await waitFor(() => expect(google).toBeEnabled());
    expect(google).toBeVisible();
  });

  it('starts Google sign-in through Better Auth social with mode-aware callbacks', async () => {
    const user = userEvent.setup();
    render(<AuthShell mode='sign-in' />);

    const google = await screen.findByRole('button', { name: /google/i });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          callbackURL: '/signin',
          errorCallbackURL: '/signin?error=oauth_failed',
          newUserCallbackURL: '/start',
        })
      );
    });
  });

  it('starts Apple sign-up through Better Auth social with sign-up callbacks', async () => {
    const user = userEvent.setup();
    render(<AuthShell mode='sign-up' />);

    const apple = await screen.findByRole('button', { name: /apple/i });
    await waitFor(() => expect(apple).toBeEnabled());
    await user.click(apple);

    await waitFor(() => {
      expect(signInSocialMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'apple',
          callbackURL: '/signup',
          errorCallbackURL: '/signup?error=oauth_failed',
        })
      );
    });
  });

  it('surfaces Better Auth social soft-errors instead of leaving the button pending', async () => {
    const user = userEvent.setup();
    signInSocialMock.mockResolvedValueOnce({
      error: { message: 'provider unavailable' },
    });
    render(<AuthShell mode='sign-in' />);

    const google = await screen.findByRole('button', { name: /google/i });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    expect(await screen.findByText(/could not start sign-in/i)).toBeVisible();
    await waitFor(() => expect(google).toBeEnabled());
  });

  it('restores every sign-in action when OAuth cancellation returns from browser history', async () => {
    const user = userEvent.setup();
    let rejectFirstAttempt: (reason?: unknown) => void = () => {};
    signInSocialMock
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectFirstAttempt = reject;
        })
      )
      .mockReturnValueOnce(new Promise(() => {}));
    render(<AuthShell mode='sign-in' />);

    const google = await screen.findByRole('button', { name: /google/i });
    const apple = await screen.findByRole('button', { name: /apple/i });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);

    expect(google).toBeDisabled();
    expect(apple).toBeDisabled();

    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });
    globalThis.dispatchEvent(pageShow);

    await waitFor(() => expect(google).toBeEnabled());
    expect(apple).toBeEnabled();

    await user.click(apple);
    expect(google).toBeDisabled();
    expect(apple).toBeDisabled();

    rejectFirstAttempt(new Error('cancelled attempt settled late'));

    await waitFor(() => expect(apple).toBeDisabled());
    expect(google).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the signed-in first render deterministic, then hides after hydration', async () => {
    authState.isSignedIn = true;

    const serverMarkup = renderToStaticMarkup(<AuthShell mode='sign-in' />);
    expect(serverMarkup).toContain('data-auth-shell-ready="true"');
    expect(serverMarkup).toContain('Email me a Code');

    const { container } = render(<AuthShell mode='sign-in' />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
