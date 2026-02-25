import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignUpForm } from '@/components/auth/forms/SignUpForm';

const pushMock = vi.fn();
const startOAuthMock = vi.fn();
const setStepMock = vi.fn();
const clearErrorMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useAuthPageSetup', () => ({
  useAuthPageSetup: vi.fn(),
}));

vi.mock('@/hooks/useLastAuthMethod', () => ({
  useLastAuthMethod: () => [null],
}));

vi.mock('@/hooks/useLoadingStall', () => ({
  useLoadingStall: () => false,
}));

vi.mock('@/hooks/useSignUpFlow', () => ({
  useSignUpFlow: () => ({
    isLoaded: true,
    step: 'method',
    setStep: setStepMock,
    email: '',
    setEmail: vi.fn(),
    code: '',
    setCode: vi.fn(),
    loadingState: { type: 'idle' },
    error: 'OAuth provider rejected authorization.',
    clearError: clearErrorMock,
    shouldSuggestSignIn: false,
    oauthFailureProvider: 'spotify',
    startEmailFlow: vi.fn(),
    verifyCode: vi.fn(),
    resendCode: vi.fn(),
    startOAuth: startOAuthMock,
    goBack: vi.fn(),
  }),
}));

vi.mock('@/components/auth/forms/MethodSelector', () => ({
  MethodSelector: ({ error }: { error?: string | null }) => (
    <div>
      <p>Method selector</p>
      {error ? <p>{error}</p> : null}
    </div>
  ),
}));

describe('SignUpForm OAuth fallback messaging', () => {
  it('shows contextual fallback actions after Spotify OAuth failure', () => {
    render(<SignUpForm />);

    expect(screen.getByText('Spotify connection failed.')).toBeInTheDocument();
    expect(
      screen.getByText('Try another sign-up method to keep going right away.')
    ).toBeInTheDocument();

    expect(
      screen.queryByText('OAuth provider rejected authorization.')
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Try Spotify again' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with Google' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue with email' })
    ).toBeInTheDocument();
  });

  it('routes fallback action handlers to retry OAuth and email path', () => {
    render(<SignUpForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Try Spotify again' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with email' })
    );

    expect(startOAuthMock).toHaveBeenNthCalledWith(1, 'spotify');
    expect(startOAuthMock).toHaveBeenNthCalledWith(2, 'google');
    expect(clearErrorMock).toHaveBeenCalledTimes(1);
    expect(setStepMock).toHaveBeenCalledWith('email');
  });
});
