import { createHash, randomInt } from 'node:crypto';

const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_SECRET_NAMESPACE = 'jovie:notifications:email-otp:v1';

const normalizeOtp = (value: string) => value.trim();

export function generateEmailOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(EMAIL_OTP_LENGTH, '0');
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
