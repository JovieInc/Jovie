/** Countries where cookie consent is required for ALL visitors (GDPR, LGPD, PIPA). */
const CONSENT_REQUIRED_COUNTRIES = new Set([
  // EU / EEA
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
  // United Kingdom
  'GB',
  // Brazil (LGPD)
  'BR',
  // South Korea (PIPA)
  'KR',
]) as ReadonlySet<string>;

/**
 * Countries where only specific regions/states require cookie consent.
 * When the region is unknown (null), the banner is shown as a safe fallback.
 */
const CONSENT_REQUIRED_REGIONS = new Map<string, ReadonlySet<string>>([
  // US: California (CCPA/CPRA), Colorado (CPA), Virginia (VCDPA),
  // Connecticut (CTDPA), Utah (UCPA)
  ['US', new Set(['CA', 'CO', 'VA', 'CT', 'UT'])],
  // Canada: Quebec (Law 25)
  ['CA', new Set(['QC'])],
]);

/** Cloudflare/Vercel placeholders that carry no real geography. */
const UNKNOWN_COUNTRY_CODES = new Set(['XX', 'T1']);

export const COOKIE_BANNER_REQUIRED_COOKIE = 'jv_cc_required';

export function isCookieBannerRequired(
  countryCode: string | null,
  regionCode?: string | null
): boolean {
  // Fail closed: a missing, malformed or non-geographic country signal
  // (empty, 'XX' unknown, 'T1' Tor) must never suppress the banner.
  const country = countryCode?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(country) || UNKNOWN_COUNTRY_CODES.has(country)) {
    return true;
  }

  if (CONSENT_REQUIRED_COUNTRIES.has(country)) {
    return true;
  }

  const requiredRegions = CONSENT_REQUIRED_REGIONS.get(country);
  if (requiredRegions) {
    // When region is unknown, show the banner as a safe fallback
    if (!regionCode) return true;
    return requiredRegions.has(regionCode.trim().toUpperCase());
  }

  return false;
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
  readonly regionCode?: string | null;
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

  return isCookieBannerRequired(params.countryCode, params.regionCode);
}

/**
 * Client-side read of the required flag from a `document.cookie` string.
 * Fail closed: only an explicit `0` (set by the proxy for a known,
 * non-consent geography) means "not required". Absent or malformed values
 * mean required, so a missing geo signal never hides the banner or enables
 * non-essential tracking.
 */
export function isCookieBannerRequiredFromCookieString(
  cookieString: string
): boolean {
  const entry = cookieString
    .split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`)
    );
  return entry?.split('=')[1]?.trim() !== '0';
}
