import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/features/auth/forms/SignUpForm';

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams('oauth_error=account_exists'),
}));

vi.mock('@/hooks/useAuthPageSetup', () => ({
  useAuthPageSetup: vi.fn(),
}));

vi.mock('@/hooks/useLoadingStall', () => ({
  useLoadingStall: () => false,
}));

vi.mock('@/hooks/useSignUpFlow', () => ({
  useSignUpFlow: () => ({
    isLoaded: true,
    step: 'method',
    setStep: vi.fn(),
    email: '',
    setEmail: vi.fn(),
    code: '',
    setCode: vi.fn(),
    loadingState: { type: 'idle' },
    error: null,
    clearError: vi.fn(),
    shouldSuggestSignIn: false,
    oauthFailureProvider: null,
    startEmailFlow: vi.fn(),
    verifyCode: vi.fn(),
    resendCode: vi.fn(),
    startOAuth: vi.fn(),
    goBack: vi.fn(),
  }),
}));

vi.mock('@/features/auth/forms/MethodSelector', () => ({
  MethodSelector: ({ error }: { error?: string | null }) => (
    <div>
      <p>Method selector</p>
      {error ? <p>{error}</p> : null}
    </div>
  ),
}));

describe('SignUpForm OAuth callback error handling', () => {
  it('shows account exists error when oauth_error=account_exists query param is present', () => {
    render(<SignUpForm />);

    expect(
      screen.getByText(
        'An account with this email already exists. Try signing in instead.'
      )
    ).toBeInTheDocument();
  });

  it('shows "Sign in instead" link for account_exists errors', () => {
    render(<SignUpForm />);

    expect(screen.getByText('Sign in instead')).toBeInTheDocument();
  });

  it('shows retry options alongside the error', () => {
    render(<SignUpForm />);

    expect(
      screen.getByRole('button', { name: 'Try Google again' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with email' })
    ).toBeInTheDocument();
  });

  it('cleans the oauth_error param from URL', () => {
    render(<SignUpForm />);

    expect(replaceMock).toHaveBeenCalled();
  });
});
