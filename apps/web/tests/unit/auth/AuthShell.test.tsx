import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  clerkRenderState,
  clerkSignInMock,
  clerkSignUpMock,
  providerEnabledState,
  searchParamsState,
} = vi.hoisted(() => ({
  clerkRenderState: {
    signIn: 'empty' as 'empty' | 'credential' | 'social',
  },
  clerkSignInMock: vi.fn(),
  clerkSignUpMock: vi.fn(),
  providerEnabledState: {
    google: true,
    apple: true,
  },
  searchParamsState: { value: '' },
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: unknown) => {
    clerkSignInMock(props);

    if (clerkRenderState.signIn === 'credential') {
      return (
        <form data-testid='clerk-sign-in'>
          <input name='identifier' type='text' />
          <input name='password' type='password' />
          <button type='submit'>Continue</button>
        </form>
      );
    }

    if (clerkRenderState.signIn === 'social') {
      return (
        <div data-testid='clerk-sign-in'>
          <button type='button'>Continue with Google</button>
        </div>
      );
    }

    return <div data-testid='clerk-sign-in' />;
  },
  SignUp: (props: unknown) => {
    clerkSignUpMock(props);
    return <div data-testid='clerk-sign-up' />;
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
import { AuthShell } from '@/features/auth';

describe('AuthShell — JOV-2446 SSO-only contract', () => {
  beforeEach(() => {
    clerkRenderState.signIn = 'empty';
    clerkSignInMock.mockReset();
    clerkSignUpMock.mockReset();
    providerEnabledState.google = true;
    providerEnabledState.apple = true;
    searchParamsState.value = '';
  });

  it('keeps required provider and last-used badge layout guards after caller overrides', async () => {
    render(
      <AuthShell
        mode='sign-in'
        appearance={{
          elements: {
            lastAuthenticationStrategyBadge: {
              position: 'absolute',
              transform: 'translate(10px, -50%)',
            },
            socialButtonsBlockButton: {
              backgroundColor: 'rgb(1, 2, 3)',
              display: 'grid',
              overflow: 'hidden',
            },
            socialButtonsBlockButton__facebook: 'block',
          },
        }}
      />
    );

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    const signInProps = clerkSignInMock.mock.calls[0]?.[0] as {
      readonly appearance?: {
        readonly elements?: Record<string, unknown>;
      };
    };
    const elements = signInProps.appearance?.elements;

    expect(elements?.socialButtonsBlockButton).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgb(1, 2, 3)',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'visible',
        position: 'relative',
      })
    );
    expect(elements?.lastAuthenticationStrategyBadge).toEqual(
      expect.objectContaining({
        position: 'static',
        transform: 'none',
        whiteSpace: 'nowrap',
      })
    );
    expect(elements?.socialButtonsBlockButton__facebook).toBe('hidden');
  });

  it('hides every credential element via appearance.elements (E1 defense in depth)', async () => {
    render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(clerkSignInMock).toHaveBeenCalledTimes(1);
    });

    const elements = (
      clerkSignInMock.mock.calls[0]?.[0] as {
        readonly appearance?: { readonly elements?: Record<string, unknown> };
      }
    ).appearance?.elements;

    // Row containers
    expect(elements?.formFieldRow__identifier).toBe('hidden');
    expect(elements?.formFieldRow__emailAddress).toBe('hidden');
    expect(elements?.formFieldRow__password).toBe('hidden');
    // Field wrappers
    expect(elements?.formField__identifier).toBe('hidden');
    expect(elements?.formField__emailAddress).toBe('hidden');
    expect(elements?.formField__password).toBe('hidden');
    // Inputs themselves
    expect(elements?.formFieldInput__identifier).toBe('hidden');
    expect(elements?.formFieldInput__emailAddress).toBe('hidden');
    expect(elements?.formFieldInput__password).toBe('hidden');
    // Labels
    expect(elements?.formFieldLabel__identifier).toBe('hidden');
    expect(elements?.formFieldLabel__emailAddress).toBe('hidden');
    expect(elements?.formFieldLabel__password).toBe('hidden');
    // Username/phone (forbidden by audit; assert defense-in-depth hides)
    expect(elements?.formFieldRow__username).toBe('hidden');
    expect(elements?.formField__username).toBe('hidden');
    expect(elements?.formFieldInput__username).toBe('hidden');
    expect(elements?.formFieldLabel__username).toBe('hidden');
    expect(elements?.formFieldRow__phoneNumber).toBe('hidden');
    expect(elements?.formField__phoneNumber).toBe('hidden');
    expect(elements?.formFieldInput__phoneNumber).toBe('hidden');
    expect(elements?.formFieldLabel__phoneNumber).toBe('hidden');
    expect(elements?.formattedPhoneNumberInput).toBe('hidden');
    // Verification-step fields
    expect(elements?.formFieldInput__code).toBe('hidden');
    expect(elements?.otpCodeFieldInput).toBe('hidden');
    expect(elements?.formResendCodeLink).toBe('hidden');
    // Form chrome
    expect(elements?.formButtonPrimary).toBe('hidden');
    expect(elements?.dividerRow).toBe('hidden');
    expect(elements?.alternativeMethods).toBe('hidden');
    expect(elements?.alternativeMethodsBlockButton).toBe('hidden');
  });

  it('renders stable full-label provider slots before Clerk is ready', () => {
    const { container } = render(<AuthShell mode='sign-in' />);

    expect(
      container.querySelector('[data-auth-provider-slot="google"]')
    ).toHaveTextContent('Continue with Google');
    expect(
      container.querySelector('[data-auth-provider-slot="apple"]')
    ).toHaveTextContent('Continue with Apple');
  });

  it('placeholder skeleton renders no input, no "or" divider, has animate-pulse + data-loading', () => {
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
    expect(placeholder?.querySelector('input')).toBeNull();
    expect(placeholder?.textContent ?? '').not.toMatch(/\bor\b/);
  });

  it('releases the placeholder when Clerk renders a social-only start state', async () => {
    clerkRenderState.signIn = 'social';

    const { container } = render(<AuthShell mode='sign-in' />);

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-auth-shell-ready',
        'true'
      );
    });
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).toBeNull();
  });

  it('keeps placeholder up when Clerk regresses to a credential-only start (prevention test for dashboard regression)', async () => {
    // JOV-2446 contract: if Clerk's dashboard regresses and only credential
    // inputs render, the readiness signal must NOT fire. The placeholder
    // stays up, regression is visible to the Layer A canary, and the
    // config-audit cron alerts within 30 min.
    clerkRenderState.signIn = 'credential';

    const { container } = render(<AuthShell mode='sign-in' />);

    // Wait long enough for any MutationObserver pass; ready must stay false.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(container.firstElementChild).toHaveAttribute(
      'data-auth-shell-ready',
      'false'
    );
    expect(
      container.querySelector('[data-auth-stable-placeholder]')
    ).not.toBeNull();
  });

  it('/signin cross-link points to /support (Need help), not /waitlist', () => {
    const { container } = render(<AuthShell mode='sign-in' />);

    const link = container.querySelector(
      '[data-auth-stable-placeholder] a[href]'
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('/support');
    expect(link?.textContent ?? '').toMatch(/get help/i);
    const prompt = link?.parentElement?.textContent ?? '';
    expect(prompt).toMatch(/need help/i);
    // Anti-regression: must not point at /waitlist
    expect(link?.getAttribute('href')).not.toContain('/waitlist');
  });

  it('/signup cross-link still points to /signin (Have an account)', () => {
    const { container } = render(<AuthShell mode='sign-up' />);

    const link = container.querySelector(
      '[data-auth-stable-placeholder] a[href]'
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('/signin');
    expect(link?.textContent ?? '').toMatch(/sign in/i);
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
    // Clerk is NOT mounted on the unavailable surface.
    expect(clerkSignInMock).not.toHaveBeenCalled();
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
