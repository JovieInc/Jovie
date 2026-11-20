import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for each AuthShell surface. The full
// callback and analytics contract lives in tests/unit/auth/AuthShell.test.tsx.
const {
  providerEnabledState,
  searchParamsState,
  signInSocialMock,
  sendOtpMock,
} = vi.hoisted(() => ({
  providerEnabledState: { google: true, apple: true },
  searchParamsState: { value: '' },
  signInSocialMock: vi.fn(),
  sendOtpMock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { social: signInSocialMock, emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: sendOtpMock },
    oneTap: vi.fn(),
  },
  isGoogleOneTapConfigured: () => false,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  trackFunnelStep: vi.fn(),
}));

vi.mock('@/lib/auth/oauth-providers', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/auth/oauth-providers')
  >('@/lib/auth/oauth-providers');
  return {
    ...actual,
    getEnabledAuthOAuthProviders: () =>
      actual.AUTH_OAUTH_PROVIDER_ORDER.filter(
        provider => providerEnabledState[provider]
      ),
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { AuthShell } from './AuthShell';

async function findEnabledGoogleButton() {
  const button = await screen.findByRole('button', {
    name: 'Continue with Google',
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('AuthShell states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerEnabledState.google = true;
    providerEnabledState.apple = true;
    searchParamsState.value = '';
    signInSocialMock.mockResolvedValue(undefined);
    sendOtpMock.mockResolvedValue({ data: {} });
  });

  it('renders the sign-up surface with providers, email, legal copy and the sign-in cross-link', async () => {
    const { container } = render(
      <AuthShell mode='sign-up' suppressOneTap oppositeModeUrl='/signin' />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Continue to Jovie' })
    ).toBeInTheDocument();
    await findEnabledGoogleButton();
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' })
    ).toBeEnabled();
    expect(
      screen.getByRole('group', { name: 'Social sign-in options' })
    ).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('or use email')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.getByRole('link', { name: 'Terms of Service' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the sign-in surface without the sign-up cross-link', async () => {
    const { container } = render(<AuthShell mode='sign-in' suppressOneTap />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Log in to Jovie' })
    ).toBeInTheDocument();
    await findEnabledGoogleButton();
    expect(
      screen.queryByRole('link', { name: 'Sign in' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Trouble signing in?' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('holds every provider busy while one provider start is in flight', async () => {
    const user = userEvent.setup();
    signInSocialMock.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<AuthShell mode='sign-up' suppressOneTap />);

    await user.click(await findEnabledGoogleButton());

    expect(
      screen.getByRole('group', { name: 'Social sign-in options' })
    ).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('button', { name: 'Continue with Google loading' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Continue with Apple' })
    ).toBeDisabled();
    expect(signInSocialMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('announces a failed provider start and re-enables the providers', async () => {
    const user = userEvent.setup();
    signInSocialMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { container } = render(<AuthShell mode='sign-up' suppressOneTap />);

    await user.click(await findEnabledGoogleButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start sign-up. Please try again.'
    );
    expect(
      screen.getByRole('button', { name: 'Continue with Google' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('treats a resolved Better Auth error the same as a thrown failure', async () => {
    const user = userEvent.setup();
    signInSocialMock.mockResolvedValue({
      error: { message: 'Provider unavailable', status: 503 },
    });
    render(<AuthShell mode='sign-in' suppressOneTap />);

    await user.click(await findEnabledGoogleButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start sign-in. Please try again.'
    );
  });

  it('leads with the email form when no provider is enabled', async () => {
    providerEnabledState.google = false;
    providerEnabledState.apple = false;
    const { container } = render(<AuthShell mode='sign-in' suppressOneTap />);

    expect(
      container.querySelector('[data-auth-shell-providers="0"]')
    ).not.toBeNull();
    expect(
      screen.queryByRole('group', { name: 'Social sign-in options' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('or use email')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows an offer recap without a price line for a sales-led plan', async () => {
    searchParamsState.value = 'plan=max';
    const { container } = render(<AuthShell mode='sign-up' suppressOneTap />);

    const recap = container.querySelector('[data-auth-offer-summary]');
    expect(recap).toHaveTextContent('Contact sales');
    expect(recap?.querySelectorAll('p')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for a long claim handle in a right-to-left page', async () => {
    const handle = 'a'.repeat(30);
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AuthShell
          mode='sign-up'
          suppressOneTap
          claimHandle={handle}
          initialValues={{
            emailAddress: 'booking.and.management.team@example-records.com',
          }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: `Claim @${handle}` })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(
      'booking.and.management.team@example-records.com'
    );
    await expectNoA11yViolations(container);
  });
});
