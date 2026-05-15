export type ConsentPreferences = {
  readonly essential: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
};

export const CONSENT_COOKIE_NAME = 'jv_cc';

export function parseConsentCookieValue(
  cookieValue: string | undefined
): ConsentPreferences | null {
  try {
    if (!cookieValue) return null;
    const parsed = JSON.parse(cookieValue) as ConsentPreferences;
    if (typeof parsed?.essential !== 'boolean') return null;
    if (typeof parsed?.analytics !== 'boolean') return null;
    if (typeof parsed?.marketing !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasAnalyticsOrMarketingConsent(
  cookieValue: string | undefined
): boolean {
  const consent = parseConsentCookieValue(cookieValue);
  return consent?.analytics === true || consent?.marketing === true;
}

export function hasAnalyticsConsent(cookieValue: string | undefined): boolean {
  const consent = parseConsentCookieValue(cookieValue);
  return consent?.analytics === true;
}
