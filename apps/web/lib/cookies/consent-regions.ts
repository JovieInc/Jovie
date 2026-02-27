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

/**
 * Resolve whether the cookie banner is required by checking the cookie header
 * first, then falling back to region-based detection.
 *
 * Only explicit '0' (not required) and '1' (required) cookie values are
 * honoured; any other value (malformed, empty, etc.) falls through to
 * region detection so we never silently suppress the banner.
 */
export function resolveCookieBannerRequirement(params: {
  readonly cookieHeader: string | null;
  readonly countryCode: string | null;
}): boolean {
  const cookieValue = params.cookieHeader
    ?.split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`)
    )
    ?.split('=')[1]
    ?.trim();

  if (cookieValue === '0') return false;
  if (cookieValue === '1') return true;

  return isCookieBannerRequired(params.countryCode);
}
