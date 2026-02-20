const CONSENT_REQUIRED_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'GB',
]) as ReadonlySet<string>;

export const COOKIE_BANNER_REQUIRED_COOKIE = 'jv_cc_required';

export function isCookieBannerRequired(countryCode: string | null): boolean {
  if (!countryCode) {
    return true;
  }

  return CONSENT_REQUIRED_COUNTRIES.has(countryCode.trim().toUpperCase());
}
