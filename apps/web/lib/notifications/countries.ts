export interface CountryOption {
  code: string;
  dialCode: string;
  flag: string;
  label: string;
}

/**
 * Countries supported by Twilio SMS, sorted by usage/popularity
 */
export const COUNTRY_OPTIONS: CountryOption[] = [
  // North America
  { code: 'US', dialCode: '+1', flag: '🇺🇸', label: 'United States' },
  { code: 'CA', dialCode: '+1', flag: '🇨🇦', label: 'Canada' },
  { code: 'MX', dialCode: '+52', flag: '🇲🇽', label: 'Mexico' },
  // Europe
  { code: 'GB', dialCode: '+44', flag: '🇬🇧', label: 'United Kingdom' },
  { code: 'DE', dialCode: '+49', flag: '🇩🇪', label: 'Germany' },
  { code: 'FR', dialCode: '+33', flag: '🇫🇷', label: 'France' },
  { code: 'ES', dialCode: '+34', flag: '🇪🇸', label: 'Spain' },
  { code: 'IT', dialCode: '+39', flag: '🇮🇹', label: 'Italy' },
  { code: 'NL', dialCode: '+31', flag: '🇳🇱', label: 'Netherlands' },
  { code: 'BE', dialCode: '+32', flag: '🇧🇪', label: 'Belgium' },
  { code: 'CH', dialCode: '+41', flag: '🇨🇭', label: 'Switzerland' },
  { code: 'AT', dialCode: '+43', flag: '🇦🇹', label: 'Austria' },
  { code: 'SE', dialCode: '+46', flag: '🇸🇪', label: 'Sweden' },
  { code: 'NO', dialCode: '+47', flag: '🇳🇴', label: 'Norway' },
  { code: 'DK', dialCode: '+45', flag: '🇩🇰', label: 'Denmark' },
  { code: 'FI', dialCode: '+358', flag: '🇫🇮', label: 'Finland' },
  { code: 'IE', dialCode: '+353', flag: '🇮🇪', label: 'Ireland' },
  { code: 'PT', dialCode: '+351', flag: '🇵🇹', label: 'Portugal' },
  { code: 'PL', dialCode: '+48', flag: '🇵🇱', label: 'Poland' },
  { code: 'CZ', dialCode: '+420', flag: '🇨🇿', label: 'Czech Republic' },
  { code: 'GR', dialCode: '+30', flag: '🇬🇷', label: 'Greece' },
  { code: 'RO', dialCode: '+40', flag: '🇷🇴', label: 'Romania' },
  { code: 'HU', dialCode: '+36', flag: '🇭🇺', label: 'Hungary' },
  // Asia Pacific
  { code: 'AU', dialCode: '+61', flag: '🇦🇺', label: 'Australia' },
  { code: 'NZ', dialCode: '+64', flag: '🇳🇿', label: 'New Zealand' },
  { code: 'JP', dialCode: '+81', flag: '🇯🇵', label: 'Japan' },
  { code: 'KR', dialCode: '+82', flag: '🇰🇷', label: 'South Korea' },
  { code: 'SG', dialCode: '+65', flag: '🇸🇬', label: 'Singapore' },
  { code: 'HK', dialCode: '+852', flag: '🇭🇰', label: 'Hong Kong' },
  { code: 'TW', dialCode: '+886', flag: '🇹🇼', label: 'Taiwan' },
  { code: 'MY', dialCode: '+60', flag: '🇲🇾', label: 'Malaysia' },
  { code: 'PH', dialCode: '+63', flag: '🇵🇭', label: 'Philippines' },
  { code: 'TH', dialCode: '+66', flag: '🇹🇭', label: 'Thailand' },
  { code: 'ID', dialCode: '+62', flag: '🇮🇩', label: 'Indonesia' },
  { code: 'VN', dialCode: '+84', flag: '🇻🇳', label: 'Vietnam' },
  { code: 'IN', dialCode: '+91', flag: '🇮🇳', label: 'India' },
  { code: 'PK', dialCode: '+92', flag: '🇵🇰', label: 'Pakistan' },
  // Middle East
  { code: 'IL', dialCode: '+972', flag: '🇮🇱', label: 'Israel' },
  { code: 'AE', dialCode: '+971', flag: '🇦🇪', label: 'United Arab Emirates' },
  { code: 'SA', dialCode: '+966', flag: '🇸🇦', label: 'Saudi Arabia' },
  // South America
  { code: 'BR', dialCode: '+55', flag: '🇧🇷', label: 'Brazil' },
  { code: 'AR', dialCode: '+54', flag: '🇦🇷', label: 'Argentina' },
  { code: 'CL', dialCode: '+56', flag: '🇨🇱', label: 'Chile' },
  { code: 'CO', dialCode: '+57', flag: '🇨🇴', label: 'Colombia' },
  { code: 'PE', dialCode: '+51', flag: '🇵🇪', label: 'Peru' },
  // Africa
  { code: 'ZA', dialCode: '+27', flag: '🇿🇦', label: 'South Africa' },
  { code: 'NG', dialCode: '+234', flag: '🇳🇬', label: 'Nigeria' },
  { code: 'KE', dialCode: '+254', flag: '🇰🇪', label: 'Kenya' },
  { code: 'EG', dialCode: '+20', flag: '🇪🇬', label: 'Egypt' },
];

/**
 * Format phone digits for display based on country dial code
 */
export function formatPhoneDigitsForDisplay(
  digits: string,
  dialCode: string
): string {
  const normalized = digits.replace(/\D/g, '');
  if (!normalized) return '';

  // US/Canada format: (XXX) XXX-XXXX
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

  // International format: groups of 3
  const grouped = normalized.match(/.{1,3}/g);
  return grouped ? grouped.join(' ') : normalized;
}

/**
 * Build E.164 phone number from digits and dial code
 */
export function buildPhoneE164(digits: string, dialCode: string): string {
  const digitsOnly = digits.replace(/[^\d]/g, '');
  const dialDigits = dialCode.replace(/[^\d]/g, '');
  return `+${dialDigits}${digitsOnly}`;
}

/**
 * Get max national digits allowed for a dial code (E.164 max is 15 total)
 */
export function getMaxNationalDigits(dialCode: string): number {
  const dialDigits = dialCode.replace(/[^\d]/g, '');
  return Math.max(0, 15 - dialDigits.length);
}
