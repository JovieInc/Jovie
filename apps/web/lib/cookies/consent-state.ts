export type ConsentPreferences = {
  readonly essential: boolean;
  readonly analytics: boolean;
  readonly marketing: boolean;
};

export const CONSENT_COOKIE_NAME = 'jv_cc';
export const TRACKING_CONSENT_COOKIE_NAME = 'jv_tracking_consent';

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

/**
 * Server-side advertising consent for a request. Opt-out regions default-allow
 * without a saved choice, consent-required regions need an affirmative opt-in,
 * and a Global Privacy Control signal (Sec-GPC: 1) always opts out, matching
 * the browser-side gate.
 */
export function hasServerMarketingConsent({
  consent,
  requiresCookieConsent,
  secGpc,
  trackingConsent,
}: {
  readonly consent: ConsentPreferences | null;
  readonly requiresCookieConsent: boolean;
  readonly secGpc: string | null;
  readonly trackingConsent?: string | null;
}): boolean {
  // Browser withdrawal applies before the httpOnly granular cookie is saved.
  if (secGpc === '1' || trackingConsent === 'rejected') return false;
  if (consent) return consent.marketing === true;
  return !requiresCookieConsent;
}

export const PRIVACY_CHOICES_HREF = '/legal/privacy#privacy-choices';
export const PRIVACY_CHOICES_LABEL =
  'Do Not Sell or Share My Personal Information';
export const GPC_CONFIRMATION = "Your browser's privacy signal is honored";
