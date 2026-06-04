import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authResourceState,
  providerEnabledState,
  searchParamsState,
  signInSsoMock,
  signUpSsoMock,
} = vi.hoisted(() => ({
  authResourceState: {
    clerkLoaded: true,
    signInLoaded: true,
    signUpLoaded: true,
  },
  providerEnabledState: {
    google: true,
    apple: true,
  },
  searchParamsState: { value: '' },
  signInSsoMock: vi.fn(),
  signUpSsoMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    loaded: authResourceState.clerkLoaded,
  }),
  useSignIn: () =>
    authResourceState.signInLoaded
      ? {
          signIn: {
            sso: signInSsoMock,
          },
        }
      : {
          signIn: null,
        },
  useSignUp: () =>
    authResourceState.signUpLoaded
      ? {
          signUp: {
            sso: signUpSsoMock,
          },
        }
      : {
          signUp: null,
        },
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

import { authClerkLocalization } from '@/components/providers/clerkLocalization';
import { APP_ROUTES } from '@/constants/routes';
import { AuthShell } from '@/features/auth';

function expectNoCredentialInputs(container: HTMLElement) {
  expect(
    container.querySelector(
      'input[name="identifier"], input[name="emailAddress"], input[type="email"], input[type="password"]'
    )
  ).toBeNull();
}

describe('AuthShell — JOV-2778 app-owned SSO-only contract', () => {
  beforeEach(() => {
    authResourceState.clerkLoaded = true;
    authResourceState.signInLoaded = true;
    authResourceState.signUpLoaded = true;
    providerEnabledState.google = true;
    providerEnabledState.apple = true;
    searchParamsState.value = '';
    signInSsoMock.mockReset();
    signInSsoMock.mockResolvedValue({ error: null });
    signUpSsoMock.mockReset();
    signUpSsoMock.mockResolvedValue({ error: null });
  });

  it('renders stable full-label provider slots before Clerk is ready', () => {
    authResourceState.signInLoaded = false;

    const { container } = render(<AuthShell mode='sign-in' />);

    expect(
      container.querySelector('[data-auth-provider-slot="google"]')
    ).toHaveTextContent('Continue with Google');
    expect(
      container.querySelector('[data-auth-provider-slot="apple"]')
    ).toHaveTextContent('Continue with Apple');
    expectNoCredentialInputs(container);
  });

  it('placeholder skeleton renders no input, no "or" divider, has animate-pulse + data-loading', () => {
    authResourceState.signInLoaded = false;

    const { container } = render(<AuthShell mode='sign-in' />);

    const placeholder = container.querySelector(
      '[data-auth-stable-placeholder]'
    );

    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveAttribute('data-loading', 'true');
    expect(placeholder).toHaveAttribute(
      'aria-label',
      'Loading sign-in options'
    );
    expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(placeholder?.classList.contains('animate-pulse')).toBe(true);
    expect(
      placeholder?.querySelector('[data-auth-oauth-error-slot]')
    ).toHaveAttribute('aria-hidden', 'true');
    expectNoCredentialInputs(container);
    expect(placeholder?.textContent ?? '').not.toMatch(/\bor\b/);
  });

  it('renders a ready sign-in SSO surface without mounting credential inputs', async () => {
    const { container } = render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });

    expect(container.querySelector('[data-auth-sso-surface]')).not.toBeNull();
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).toBeNull();
    expectNoCredentialInputs(container);
    expect(container.textContent ?? '').not.toMatch(/\bor\b/);
  });

  it('starts Google sign-in through Clerk redirect with the canonical callback and account chooser', async () => {
    const user = userEvent.setup();

    render(
      <AuthShell mode='sign-in' fallbackRedirectUrl='/app?source=auth-test' />
    );

    const googleButton = await screen.findByRole('button', {
      name: /continue with google/i,
    });
    await user.click(googleButton);

    expect(signInSsoMock).toHaveBeenCalledWith({
      oidcPrompt: 'select_account',
      redirectCallbackUrl: '/signin/sso-callback',
      redirectUrl: '/app?source=auth-test',
      strategy: 'oauth_google',
    });
    expect(signUpSsoMock).not.toHaveBeenCalled();
  });

  it('starts Apple sign-up through Clerk redirect with the sign-up callback and legal acceptance', async () => {
    const user = userEvent.setup();

    render(<AuthShell mode='sign-up' />);

    const appleButton = await screen.findByRole('button', {
      name: /continue with apple/i,
    });
    await user.click(appleButton);

    expect(signUpSsoMock).toHaveBeenCalledWith({
      legalAccepted: true,
      oidcPrompt: 'select_account',
      redirectCallbackUrl: '/signup/sso-callback',
      redirectUrl: APP_ROUTES.WAITLIST,
      strategy: 'oauth_apple',
    });
    expect(signInSsoMock).not.toHaveBeenCalled();
  });

  it('renders a stable inline error when the OAuth redirect cannot start', async () => {
    const user = userEvent.setup();
    signInSsoMock.mockRejectedValueOnce(new Error('oauth down'));

    render(<AuthShell mode='sign-in' />);

    const googleButton = await screen.findByRole('button', {
      name: /continue with google/i,
    });
    await user.click(googleButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start sign-in. Please try again.'
    );
    expect(googleButton).toBeEnabled();
  });

  it('renders a stable inline error when Clerk returns an SSO error object', async () => {
    const user = userEvent.setup();
    signInSsoMock.mockResolvedValueOnce({
      error: new Error('oauth unavailable'),
    });

    render(<AuthShell mode='sign-in' />);

    const googleButton = await screen.findByRole('button', {
      name: /continue with google/i,
    });
    await user.click(googleButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start sign-in. Please try again.'
    );
    expect(googleButton).toBeEnabled();
  });

  it('/signin cross-link points to /support (Need help), not /waitlist', async () => {
    const { container } = render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });

    const link = screen.getByRole('link', { name: /get help/i });
    expect(link).toHaveAttribute('href', '/support');
    expect(link.parentElement?.textContent ?? '').toMatch(/need help/i);
    // Anti-regression: must not point at /waitlist
    expect(link).not.toHaveAttribute(
      'href',
      expect.stringContaining('/waitlist')
    );
  });

  it('/signup cross-link still points to /signin (Have an account)', async () => {
    const { container } = render(<AuthShell mode='sign-up' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });

    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/signin');
  });

  it('renders AuthProvidersUnavailable when zero OAuth providers are enabled', () => {
    providerEnabledState.google = false;
    providerEnabledState.apple = false;

    const { container, getByRole } = render(<AuthShell mode='sign-in' />);

    expect(
      container.querySelector('[data-auth-providers-unavailable]')
    ).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute(
      'data-auth-shell-providers',
      '0'
    );
    // No SSO placeholder slots when fully unavailable.
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).toBeNull();
    // Support mailto remains reachable.
    expect(getByRole('link', { name: /contact support/i })).toHaveAttribute(
      'href',
      'mailto:support@jov.ie'
    );
    expect(signInSsoMock).not.toHaveBeenCalled();
  });

  it('keeps legal copy in stable line groups with valid fallback hrefs', () => {
    const { container } = render(<AuthShell mode='sign-up' />);

    expect(
      container.querySelector('[data-auth-legal-prefix]')
    ).toHaveTextContent('By signing up, you agree to our');
    expect(
      container.querySelector('[data-auth-legal-links]')
    ).toHaveTextContent('Terms of Service and Privacy Policy.');

    expect(container.querySelector('a[href="/legal/terms"]')).toHaveTextContent(
      'Terms of Service'
    );
    expect(
      container.querySelector('a[href="/legal/privacy"]')
    ).toHaveTextContent('Privacy Policy');
  });

  it('shares the same full provider copy with Clerk localization', () => {
    expect(authClerkLocalization.socialButtonsBlockButton).toBe(
      'Continue with {{provider|titleize}}'
    );
    expect(authClerkLocalization.socialButtonsBlockButtonManyInView).toBe(
      'Continue with {{provider|titleize}}'
    );
  });
});
