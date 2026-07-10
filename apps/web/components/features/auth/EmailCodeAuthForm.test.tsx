import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

// Better Auth client calls resolve with `{ data, error }` instead of
// throwing. Regression coverage for the silent-failure bug where an error
// result advanced the flow (send → code step with no OTP in flight; verify →
// hard navigation while signed out).

const sendVerificationOtp = vi.fn();
const signInEmailOtp = vi.fn();

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    emailOtp: {
      sendVerificationOtp: (...args: unknown[]) => sendVerificationOtp(...args),
    },
    signIn: {
      emailOtp: (...args: unknown[]) => signInEmailOtp(...args),
    },
  },
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const locationAssign = vi.fn();

function renderForm() {
  return render(<EmailCodeAuthForm mode='sign-up' redirectUrl='/start' />);
}

async function submitEmail() {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'artist@example.com' },
  });
  fireEvent.submit(
    screen.getByLabelText(/email/i).closest('form') as HTMLFormElement
  );
}

async function reachCodeStep() {
  sendVerificationOtp.mockResolvedValueOnce({
    data: { success: true },
    error: null,
  });
  await submitEmail();
  await waitFor(() =>
    expect(
      document.querySelector('[data-auth-email-code-step="code"]')
    ).toBeTruthy()
  );
}

async function submitCode(code: string) {
  // The autofill overlay input accepts the full code in one change event and
  // fires `onComplete` once all six digits are present.
  fireEvent.change(screen.getByTestId('otp-autofill-input'), {
    target: { value: code },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign: locationAssign } as unknown as Location);
});

describe('EmailCodeAuthForm', () => {
  it('stays on the email step and shows an error when send returns an error result', async () => {
    sendVerificationOtp.mockResolvedValueOnce({
      data: null,
      error: { status: 429, statusText: 'Too Many Requests' },
    });
    renderForm();
    await submitEmail();

    await waitFor(() =>
      expect(
        screen.getByText(/too many requests\. please wait a moment/i)
      ).toBeTruthy()
    );
    expect(
      document.querySelector('[data-auth-email-code-step="code"]')
    ).toBeNull();
  });

  it('shows the invalid-code error and does not navigate when verify returns an error result', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: { code: 'INVALID_OTP', message: 'Invalid OTP', status: 400 },
    });
    await submitCode('111111');

    await waitFor(() =>
      expect(screen.getByText(/that code is incorrect/i)).toBeTruthy()
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('locks the flow when verify reports too many attempts', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many attempts',
        status: 403,
      },
    });
    await submitCode('111111');

    await waitFor(() =>
      expect(
        document.querySelector('[data-auth-email-code-step="locked"]')
      ).toBeTruthy()
    );
    expect(locationAssign).not.toHaveBeenCalled();
  });

  it('navigates to the redirect URL when verify succeeds', async () => {
    renderForm();
    await reachCodeStep();

    signInEmailOtp.mockResolvedValueOnce({ data: { user: {} }, error: null });
    await submitCode('424242');

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith('/start'));
  });
});
