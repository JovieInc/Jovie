import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// Rendered-state and accessibility coverage for the real sign-in page, with
// the real AuthLayout and AuthShell. The auth-prop routing contract lives in
// tests/unit/app/signin-page.test.tsx.
const { searchParamsState, isElectronRuntimeMock } = vi.hoisted(() => ({
  searchParamsState: { value: '' },
  isElectronRuntimeMock: vi.fn(() => false),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/signin',
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { social: vi.fn(), emailOtp: vi.fn(), passkey: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
    oneTap: vi.fn(),
  },
  isGoogleOneTapConfigured: () => false,
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  isElectronRuntime: () => isElectronRuntimeMock(),
  openDesktopAuthUrl: vi.fn().mockResolvedValue({ ok: true }),
  supportsDesktopAuthReturnCode: () => false,
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/analytics/signup-funnel-client', () => ({
  trackFunnelStep: vi.fn(),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { SignInPageClient } from './SignInPageClient';

async function findSignInHeading() {
  return screen.findByRole('heading', { level: 1, name: 'Log in to Jovie' });
}

describe('SignInPageClient states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.value = '';
    isElectronRuntimeMock.mockReturnValue(false);
    window.history.replaceState({}, '', '/signin');
  });

  it('renders the sign-in surface with no error banner by default', async () => {
    const { container } = render(<SignInPageClient />);

    await findSignInHeading();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Continue with Google' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains a provider consent the visitor denied and strips the code from the URL', async () => {
    searchParamsState.value = 'error=access_denied';
    window.history.replaceState({}, '', '/signin?error=access_denied&x=1');
    const { container } = render(<SignInPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign-in was cancelled. Try again, or pick a different method.'
    );
    await waitFor(() => expect(window.location.search).toBe('?x=1'));
    await findSignInHeading();
    await expectNoA11yViolations(container);
  });

  it.each([
    [
      'state_mismatch',
      'Sign-in failed for security reasons. Please try again.',
    ],
    [
      'account_exists',
      'An account with this email already exists. Try signing in with your email instead.',
    ],
    [
      'provider_exploded',
      'Something went wrong with sign-in. Please try again.',
    ],
  ])('maps the %s provider error to its copy', async (code, copy) => {
    searchParamsState.value = `error=${code}`;
    const { container } = render(<SignInPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(copy);
    await expectNoA11yViolations(container);
  });

  it('reads the legacy oauth_error parameter when error is absent', async () => {
    searchParamsState.value = 'oauth_error=oauth_callback_error';
    render(<SignInPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong with the sign-in. Please try again.'
    );
  });

  it('prefills a long but valid email address in the email field', async () => {
    const email = `${'a'.repeat(64)}@${'long-label'.repeat(5)}.example.com`;
    searchParamsState.value = `email=${encodeURIComponent(email)}`;
    const { container } = render(<SignInPageClient />);

    await findSignInHeading();
    expect(await screen.findByDisplayValue(email)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the sign-in surface inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SignInPageClient />
      </div>
    );

    await findSignInHeading();
    await expectNoA11yViolations(container);
  });

  it('hands the Mac app to the browser instead of showing the web form', async () => {
    searchParamsState.value = 'runtime=electron';
    const { container } = render(<SignInPageClient />);

    expect(
      screen.getByTestId('desktop-auth-route-handoff')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Log in to Jovie' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
