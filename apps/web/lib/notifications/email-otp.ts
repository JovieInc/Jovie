import { createHash, randomInt } from 'node:crypto';
import {
  FAN_CAPTURE_E2E_OTP_CODE,
  isDeterministicFanCaptureOtpEnabled,
} from '@/lib/e2e/runtime';

const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MINUTES = 10;
export const EMAIL_OTP_TTL_MS = EMAIL_OTP_TTL_MINUTES * 60 * 1000;
const EMAIL_OTP_SECRET_NAMESPACE = 'jovie:notifications:email-otp:v1';

const normalizeOtp = (value: string) => value.trim();

export function generateEmailOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(EMAIL_OTP_LENGTH, '0');
}

/** Fan-capture subscribe flow only — deterministic in local/CI E2E. */
export function generateFanCaptureEmailOtpCode(): string {
  if (isDeterministicFanCaptureOtpEnabled()) {
    return FAN_CAPTURE_E2E_OTP_CODE;
  }
  return generateEmailOtpCode();
}

export function hashEmailOtp(code: string): string {
  return createHash('sha256')
    .update(`${EMAIL_OTP_SECRET_NAMESPACE}:${normalizeOtp(code)}`)
    .digest('hex');
}

export function isValidEmailOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(normalizeOtp(code));
}

export function buildEmailOtpExpiry(now = Date.now()): Date {
  return new Date(now + EMAIL_OTP_TTL_MS);
}
