import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Verify errors that arrive after Better Auth has consumed the code
 * (2026-11-09 sign-in incident), and reporting of unmapped verify codes.
 */

const {
  authState,
  mockCaptureWarning,
  mockSendVerificationOtp,
  mockSignInEmailOtp,
} = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
  mockCaptureWarning: vi.fn(),
  mockSendVerificationOtp: vi.fn(),
  mockSignInEmailOtp: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: mockSendVerificationOtp },
    signIn: { emailOtp: mockSignInEmailOtp },
  },
}));

import { EmailCodeAuthForm } from '@/components/features/auth/EmailCodeAuthForm';

/** The first visible OTP digit box (excludes the hidden autofill overlay input). */
function getFirstDigitInput(): HTMLElement {
  const digit = screen
    .getAllByRole('textbox')
    .find(el => el.getAttribute('aria-label') === 'Digit 1 of 6');
  if (!digit) throw new Error('OTP digit input not found');
  return digit;
}

/** Pastes a full 6-digit code into the OTP input, triggering onComplete → verifyCode. */
function pasteCode(code: string) {
  fireEvent.paste(getFirstDigitInput(), {
    clipboardData: { getData: () => code },
  });
}

async function renderAndAdvanceToCodeStep(
  user: ReturnType<typeof userEvent.setup>
) {
  render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />);

  await user.type(screen.getByLabelText('Email'), 'artist@example.com');
  await user.click(screen.getByRole('button', { name: /send sign-in code/i }));

  await screen.findByText(/enter the code sent to/i);
}

describe('EmailCodeAuthForm verify errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = false;
  });

  describe('verify errors after the code was consumed', () => {
    // Production 2026-11-09: a correct code for an address with no account and
    // no active invitation returns 403 SIGNUP_INVITE_REQUIRED. Better Auth has
    // already consumed the code, so the form showed the generic fallback and a
    // second Verify click reported the valid code as incorrect.
    it('explains the invitation requirement and clears the spent code', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockResolvedValueOnce({
        data: null,
        error: {
          code: 'SIGNUP_INVITE_REQUIRED',
          message: 'An active invitation is required to create an account.',
          status: 403,
        },
      });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('444444');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/no jovie account uses this email/i);
      expect(alert).not.toHaveTextContent(/could not verify/i);
      // The code is spent server-side; it must not be resubmittable.
      expect(
        screen.getByRole('button', { name: /verify code/i })
      ).toBeDisabled();
      expect(mockSignInEmailOtp).toHaveBeenCalledTimes(1);
    });

    it('reports an unmapped verify error code instead of failing silently', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockResolvedValueOnce({
        data: null,
        error: { code: 'SOME_NEW_SERVER_CODE', status: 400 },
      });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('555555');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /could not verify the code/i
      );
      expect(mockCaptureWarning).toHaveBeenCalledWith(
        'Email OTP verify failed with an unmapped error code',
        expect.anything(),
        expect.objectContaining({
          code: 'some_new_server_code',
          status: 400,
        })
      );
    });

    it('does not report mapped verify errors', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({ code: 'invalid_otp' });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('666666');

      await screen.findByRole('alert');
      expect(mockCaptureWarning).not.toHaveBeenCalled();
    });
  });
});
