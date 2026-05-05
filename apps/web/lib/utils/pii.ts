import 'server-only';

/**
 * Mask a phone number for safe logging.
 *
 * Returns a string that preserves only the leading "+" marker (when
 * present) and the last 4 digits, with everything else redacted. We
 * deliberately do NOT preserve country-code digits because mixing them
 * with the last 4 narrows the search space too much (e.g. for a US
 * number, the area code of the carrier sender is usually known).
 *
 * Examples:
 *   logSafePhone('+15555550100')  -> '+********0100'
 *   logSafePhone('+447700900123') -> '+*********0123'
 *   logSafePhone('5555550100')    -> '*****0100'
 *   logSafePhone(null)            -> ''
 *
 * Use at every logging callsite that touches phone numbers. Raw phone in
 * database columns and webhook payloads is fine for audit; raw phone in
 * structured logs is not.
 */
export function logSafePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.length === 0) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length <= 4) return '***';

  const prefix = trimmed.startsWith('+') ? '+' : '';
  const last4 = digits.slice(-4);
  // Mask all digits except the trailing 4. At least one mask char is
  // always emitted so very short inputs don't collapse to "+0100".
  const maskedLen = Math.max(1, digits.length - last4.length);
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
