import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coverage for the OTP send/verify error-mapping branches of
 * EmailCodeAuthForm (readErrorCode/getSendErrorMessage/getVerifyErrorMessage/
 * isMaxAttemptsError). E2E only exercises the happy path (send → enter code
 * → redirect); this suite locks in the resilience branches: rate limiting,
 * malformed input, unmapped error codes, and the max-attempts lockout
 * transition.
 */

const { mockSendVerificationOtp, mockSignInEmailOtp } = vi.hoisted(() => ({
  mockSendVerificationOtp: vi.fn(),
  mockSignInEmailOtp: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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

  await user.type(screen.getByLabelText('Email Address'), 'artist@example.com');
  await user.click(screen.getByRole('button', { name: /email me a code/i }));

  await screen.findByText(/enter the code sent to/i);
}

describe('EmailCodeAuthForm', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks): a form-validation-blocked submit in
    // one test can leave a queued `.mockRejectedValueOnce()` unconsumed, and
    // clearAllMocks does not drain that queue — it would otherwise leak into
    // the next test's first send/verify call. reset guarantees a clean slate.
    vi.resetAllMocks();
  });

  describe('send-code error mapping (readErrorCode / getSendErrorMessage)', () => {
    it('shows the rate-limit copy for a rate_limit_exceeded send error', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockRejectedValueOnce({
        code: 'rate_limit_exceeded',
      });
      render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />);

      await user.type(
        screen.getByLabelText('Email Address'),
        'artist@example.com'
      );
      await user.click(
        screen.getByRole('button', { name: /email me a code/i })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /too many requests/i
      );
      // Stays on the email step — the send failed, so there is no code to enter.
      expect(
        screen.queryByText(/enter the code sent to/i)
      ).not.toBeInTheDocument();
    });

    it('shows the invalid-email copy for a form_param_format_invalid send error', async () => {
      // Server-side format rejection (e.g. Better Auth's stricter email
      // parser) — the value must still pass the native <input type="email">
      // constraint validation client-side, or the form never submits at all.
      const user = userEvent.setup();
      mockSendVerificationOtp.mockRejectedValueOnce({
        code: 'form_param_format_invalid',
      });
      render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />);

      await user.type(
        screen.getByLabelText('Email Address'),
        'artist@example.com'
      );
      await user.click(
        screen.getByRole('button', { name: /email me a code/i })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /doesn.t look right/i
      );
    });

    it('falls back to the generic send-failure copy for an unmapped error code', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockRejectedValueOnce({
        code: 'some_unmapped_provider_error',
      });
      render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />);

      await user.type(
        screen.getByLabelText('Email Address'),
        'artist@example.com'
      );
      await user.click(
        screen.getByRole('button', { name: /email me a code/i })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /could not send the code/i
      );
    });

    it('extracts the code from a "code: message" string when no .code field is present', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockRejectedValueOnce({
        message: 'rate_limit_exceeded: slow down',
      });
      render(<EmailCodeAuthForm mode='sign-in' redirectUrl='/app/dashboard' />);

      await user.type(
        screen.getByLabelText('Email Address'),
        'artist@example.com'
      );
      await user.click(
        screen.getByRole('button', { name: /email me a code/i })
      );

      // readErrorCode() should regex-extract `rate_limit_exceeded` from the
      // message and map it through SEND_ERROR_COPY, not the generic fallback.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /too many requests/i
      );
    });
  });

  describe('verify-code error mapping (getVerifyErrorMessage)', () => {
    it('shows the incorrect-code copy for invalid_otp', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({ code: 'invalid_otp' });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('111111');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /code is incorrect/i
      );
      // Not locked — invalid_otp keeps the user on the code step to retry.
      expect(
        screen.queryByText(/too many incorrect attempts/i)
      ).not.toBeInTheDocument();
    });

    it('shows the expired-code copy for otp_expired', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({ code: 'otp_expired' });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('222222');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /code has expired/i
      );
      expect(
        screen.queryByText(/too many incorrect attempts/i)
      ).not.toBeInTheDocument();
    });

    it('shows the verify-rate-limit copy for rate_limit_exceeded on verify', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({
        code: 'rate_limit_exceeded',
      });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('333333');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /too many attempts/i
      );
      expect(
        screen.queryByText(/too many incorrect attempts/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('max-attempts lockout transition (isMaxAttemptsError)', () => {
    it('transitions to the locked step on max_attempts_reached and clears the inline error', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({
        code: 'max_attempts_reached',
      });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('444444');

      expect(
        await screen.findByText(/too many incorrect attempts\./i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /request a new code/i })
      ).toBeInTheDocument();
      // step='locked' clears errorMessage and removes the code-step inline
      // error. The lockout panel itself remains an assertive alert.
      expect(
        document.getElementById('auth-email-code-error')
      ).not.toBeInTheDocument();
      // The code-entry OTP fieldset is gone — confirms the step actually
      // switched, rather than just rendering extra locked copy alongside it.
      expect(
        screen.queryByText(/enter the code sent to/i)
      ).not.toBeInTheDocument();
    });

    it('returns to the email step from the locked step via "Request A New Code"', async () => {
      const user = userEvent.setup();
      mockSendVerificationOtp.mockResolvedValueOnce({ error: null });
      mockSignInEmailOtp.mockRejectedValueOnce({
        code: 'max_attempts_reached',
      });

      await renderAndAdvanceToCodeStep(user);
      pasteCode('555555');
      await screen.findByText(/too many incorrect attempts\./i);

      await user.click(
        screen.getByRole('button', { name: /request a new code/i })
      );

      expect(await screen.findByLabelText('Email Address')).toBeInTheDocument();
      expect(
        screen.queryByText(/too many incorrect attempts/i)
      ).not.toBeInTheDocument();
    });
  });
});
