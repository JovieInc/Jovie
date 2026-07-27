import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('starts Google sign-in through Better Auth social with mode-aware callbacks', async () => {
    const user = userEvent.setup();
    render(<AuthShell mode='sign-in' />);

    const google = await screen.findByRole('button', { name: /google/i });
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

  it('renders nothing when the visitor is already signed in', () => {
    authState.isSignedIn = true;
    const { container } = render(<AuthShell mode='sign-in' />);
    expect(container).toBeEmptyDOMElement();
  });
});
