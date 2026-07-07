/**
 * Auth OTP Email Template (Clerk → Better Auth migration, client-flip commit ⑦).
 *
 * Sent via the `sendVerificationOTP` hook in `lib/auth/better-auth.ts` when a
 * user starts the email one-time-code sign-in/sign-up flow. Contains a 6-digit
 * OTP code valid for 10 minutes (matching the `emailOTP({ expiresIn: 600 })`
 * config in better-auth.ts).
 *
 * Deterministic E2E path: when `E2E_TEST_MODE=1` + test-email pattern, the
 * server returns `424242` and nothing is sent (better-auth.ts
 * `isDeterministicTestOtpEmail`).
 */

import { env } from '@/lib/env';
import { escapeHtml } from '../utils';

export interface AuthOtpTemplateData {
  /** 6-digit OTP code */
  otpCode: string;
}

const OTP_TTL_MINUTES = 10;

export function getAuthOtpSubject(): string {
  return 'Your Jovie sign-in code';
}

export function getAuthOtpText(data: AuthOtpTemplateData): string {
  return `Your Jovie verification code: ${data.otpCode}

Enter this code to sign in to your Jovie account. This code expires in ${OTP_TTL_MINUTES} minutes.

If you didn't request this, you can ignore this email.`;
}

export function getAuthOtpHtml(data: AuthOtpTemplateData): string {
  const safeCode = escapeHtml(data.otpCode);

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:400px;margin:0 auto;padding:32px 0;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="margin:0;font-size:20px;font-weight:600;color:#0a0a0a;">Jovie</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#6b6b6b;">Sign in to your account</p>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;font-size:32px;font-weight:600;letter-spacing:8px;color:#0a0a0a;background:#f5f5f5;border-radius:8px;padding:16px 24px;">${safeCode}</div>
      </div>
      <p style="text-align:center;font-size:14px;color:#6b6b6b;line-height:1.5;margin:24px 0;">
        Enter this code to sign in. This code expires in ${OTP_TTL_MINUTES} minutes.
      </p>
      <p style="text-align:center;font-size:12px;color:#999;margin:32px 0 0;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;
}

/**
 * Resolve the Resend "from" address. Falls back to a sensible default when
 * `RESEND_FROM_EMAIL` is unset (local dev without the env var).
 */
export function getAuthOtpFromEmail(): string {
  return env.RESEND_FROM_EMAIL || 'Jovie <no-reply@jov.ie>';
}
