import 'server-only';

/**
 * Mask a phone number for safe logging.
 *
 * Returns a string that preserves country code prefix and the last 4 digits
 * with the middle redacted. Returns "" for missing input. Never throws.
 *
 * Examples:
 *   logSafePhone('+15555550100') -> '+1*******0100'
 *   logSafePhone('+447700900123') -> '+44*******0123'
 *   logSafePhone(null) -> ''
 *
 * Use at every logging callsite that touches phone numbers. Raw phone in
 * database columns and webhook payloads is fine for audit; raw phone in
 * structured logs is not.
 */
export function logSafePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 5) return '***';

  // Preserve a leading "+" plus 1-3 country-code digits, keep last 4, mask middle.
  const startsWithPlus = trimmed.startsWith('+');
  const prefix = startsWithPlus
    ? trimmed.slice(0, Math.min(3, trimmed.length - 4))
    : trimmed.slice(0, 1);
  const last4 = trimmed.slice(-4);
  const maskedLen = Math.max(0, trimmed.length - prefix.length - last4.length);
  return `${prefix}${'*'.repeat(maskedLen)}${last4}`;
}

/**
 * Mask an SMS intent code for logging. Reveals first and last char only.
 * Used so we can correlate logs without leaking the verification secret.
 */
export function logSafeCode(code: string | null | undefined): string {
  if (!code) return '';
  const trimmed = code.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 2) return '**';
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed.at(-1)}`;
}

/**
 * Format a phone number for fan-facing display: +1 (xxx) xxx-1234.
 *
 * The verified phone is masked except for the last 4 digits in user-facing
 * surfaces (DESIGN.md voice: precise, calm; "You're subscribed at +1 ••• 4471").
 * Unlike logSafePhone, the output is intended to be rendered to users.
 */
export function maskPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const last4 = trimmed.slice(-4);
  if (last4.length === 0) return '';
  return `••• ${last4}`;
}
