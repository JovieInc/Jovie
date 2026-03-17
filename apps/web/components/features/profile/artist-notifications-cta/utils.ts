/**
 * Formats phone digits for display based on the dial code.
 * For US (+1), formats as (XXX) XXX-XXXX.
 * For other countries, groups digits in threes.
 */
export function formatPhoneDigitsForDisplay(
  digits: string,
  dialCode: string
): string {
  const normalized = digits.replaceAll(/\D/g, '');
  if (!normalized) return '';

  if (dialCode === '+1') {
    const part1 = normalized.slice(0, 3);
    const part2 = normalized.slice(3, 6);
    const part3 = normalized.slice(6, 10);
    const rest = normalized.slice(10);

    if (normalized.length <= 3) return `(${part1}`;
    if (normalized.length <= 6) return `(${part1}) ${part2}`;
    if (normalized.length <= 10) return `(${part1}) ${part2}-${part3}`;

    return `(${part1}) ${part2}-${part3} ${rest}`.trim();
  }

  const grouped = normalized.match(/.{1,3}/g);
  return grouped ? grouped.join(' ') : normalized;
}

/**
 * Builds an E.164 formatted phone number from national digits and dial code.
 */
export function buildPhoneE164(phoneInput: string, dialCode: string): string {
  const digitsOnly = phoneInput.replaceAll(/[^\d]/g, '');
  const dialDigits = dialCode.replaceAll(/[^\d]/g, '');
  return `+${dialDigits}${digitsOnly}`;
}

/**
 * Calculates the maximum national digits allowed based on dial code.
 * E.164 allows max 15 digits total including country code.
 */
export function getMaxNationalDigits(dialCode: string): number {
  const dialDigits = dialCode.replaceAll(/[^\d]/g, '');
  return Math.max(0, 15 - dialDigits.length);
}
