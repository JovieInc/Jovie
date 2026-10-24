import 'server-only';

import { captureError } from '@/lib/error-tracking';
import { isDeterministicTestOtpEmail } from './rate-limit-rules';

/**
 * Better Auth `emailOTP.sendVerificationOTP` hook body.
 *
 * Every attempt writes one `[auth] email OTP send` line with an outcome
 * (`sent`, `skipped_test_email`, `failed`) so production logs can answer
 * "did the server receive and send it?" without guessing. The shared
 * `logger` is silent in production and Sentry logs are not enabled, so this
 * writes to the runtime log with `console.info` (Vercel runtime logs).
 *
 * `sendEmail` reports provider failures and skips as `{ success: false }`
 * instead of throwing. Treating that as success let Better Auth answer 200
 * and the form advance to the code step with no email in flight. A
 * non-success result now throws, so the client shows its send-failure copy.
 */
export interface EmailOtpSendInput {
  readonly email: string;
  readonly type: string;
  readonly otp: string;
}

type EmailOtpSendOutcome = 'sent' | 'skipped_test_email' | 'failed';

function redactEmail(email: string): string {
  return email.replace(/^[^@]*/, '[redacted]');
}

function logOutcome(
  outcome: EmailOtpSendOutcome,
  input: EmailOtpSendInput,
  detail: Record<string, unknown> = {}
): void {
  // One serialized line: object arguments can be flattened to `{}` by
  // runtime log forwarding.
  console.info(
    `[auth] email OTP send ${JSON.stringify({
      outcome,
      type: input.type,
      email: redactEmail(input.email),
      ...detail,
    })}`
  );
}

export async function sendEmailOtp(input: EmailOtpSendInput): Promise<void> {
  if (isDeterministicTestOtpEmail(input.email)) {
    // Deterministic E2E path: specs type 424242, nothing is sent.
    logOutcome('skipped_test_email', input);
    return;
  }

  try {
    // Lazy import keeps the email stack off the auth module's hot path.
    const { sendEmail } = await import('@/lib/email/send');
    const {
      getAuthOtpHtml,
      getAuthOtpFromEmail,
      getAuthOtpSubject,
      getAuthOtpText,
    } = await import('@/lib/email/templates/auth-otp');
    const result = await sendEmail({
      to: input.email,
      from: getAuthOtpFromEmail(),
      subject: getAuthOtpSubject(),
      text: getAuthOtpText({ otpCode: input.otp }),
      html: getAuthOtpHtml({ otpCode: input.otp }),
    });
    if (!result.success) {
      throw new Error(result.error || 'Email OTP was not sent');
    }
    logOutcome('sent', input, { messageId: result.messageId });
  } catch (error) {
    logOutcome('failed', input, {
      error: error instanceof Error ? error.message : String(error),
    });
    // Rethrow so Better Auth rejects the request and the form shows its
    // aria-live "Could not send the code" error instead of a code step
    // waiting for an email that never left.
    await captureError('Email OTP send failed', error, {
      email: redactEmail(input.email),
      type: input.type,
      operation: 'sendVerificationOTP',
    });
    throw error;
  }
}
