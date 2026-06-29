import type { Consent } from '@/lib/cookies/consent';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { isDNTEnabled, isGPCEnabled } from '@/lib/tracking/consent';

export type GoogleConsentModeValue = 'granted' | 'denied';

export type GoogleConsentModeState = {
  readonly analytics_storage: GoogleConsentModeValue;
  readonly ad_storage: GoogleConsentModeValue;
  readonly ad_user_data: GoogleConsentModeValue;
  readonly ad_personalization: GoogleConsentModeValue;
};

const DENIED_CONSENT: GoogleConsentModeState = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
};

const GRANTED_CONSENT: GoogleConsentModeState = {
  analytics_storage: 'granted',
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
};

const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

function getAnalyticsWindow(): AnalyticsWindow | null {
  if (globalThis.window === undefined) return null;
  return globalThis.window as AnalyticsWindow;
}

export function isValidGaMeasurementId(
  measurementId: string | undefined
): measurementId is string {
  return (
    typeof measurementId === 'string' &&
    GA_MEASUREMENT_ID_PATTERN.test(measurementId)
  );
}

export function shouldMountGoogleAnalytics(params: {
  readonly measurementId: string | undefined;
  readonly isTest: boolean;
  readonly isE2E: boolean;
  readonly isDemoRecording: boolean;
}): boolean {
  return (
    isValidGaMeasurementId(params.measurementId) &&
    !params.isTest &&
    !params.isE2E &&
    !params.isDemoRecording
  );
}

export function isCookieBannerRequiredFromClient(): boolean {
  if (globalThis.document === undefined) return false;

  const bannerCookie = globalThis.document.cookie
    .split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${COOKIE_BANNER_REQUIRED_COOKIE}=`)
    );

  return bannerCookie?.split('=')[1]?.trim() === '1';
}

export function readStoredConsentFromClient(): Consent | null {
  if (globalThis.window === undefined) return null;

  try {
    const raw = globalThis.localStorage?.getItem('jv_cc');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Consent>;
    if (
      typeof parsed.essential !== 'boolean' ||
      typeof parsed.analytics !== 'boolean' ||
      typeof parsed.marketing !== 'boolean'
    ) {
      return null;
    }

    return parsed as Consent;
  } catch {
    return null;
  }
}

export function consentToGoogleConsentMode(
  consent: Consent | null,
  bannerRequired: boolean
): GoogleConsentModeState {
  if (consent) {
    return {
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_storage: consent.marketing ? 'granted' : 'denied',
      ad_user_data: consent.marketing ? 'granted' : 'denied',
      ad_personalization: consent.marketing ? 'granted' : 'denied',
    };
  }

  if (bannerRequired) {
    return DENIED_CONSENT;
  }

  return GRANTED_CONSENT;
}

export function getGoogleConsentModeFromClient(): GoogleConsentModeState {
  if (isGPCEnabled() || isDNTEnabled()) {
    return DENIED_CONSENT;
  }

  return consentToGoogleConsentMode(
    readStoredConsentFromClient(),
    isCookieBannerRequiredFromClient()
  );
}

export function applyGoogleConsentMode(state: GoogleConsentModeState): void {
  const analyticsWindow = getAnalyticsWindow();
  analyticsWindow?.gtag?.('consent', 'update', state);
}

export function buildGoogleConsentInitScript(measurementId: string): string {
  if (!isValidGaMeasurementId(measurementId)) {
    throw new Error('Invalid GA measurement ID');
  }

  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500
});
(function () {
  var denied = {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  };
  var granted = {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted'
  };
  var gpcEnabled = navigator.globalPrivacyControl === true;
  var dntEnabled = navigator.doNotTrack === '1' || navigator.doNotTrack === 'yes';
  if (gpcEnabled || dntEnabled) {
    gtag('consent', 'update', denied);
    return;
  }
  var bannerRequired = document.cookie.split(';').some(function (cookie) {
    return cookie.trim().indexOf('${COOKIE_BANNER_REQUIRED_COOKIE}=1') === 0;
  });
  var storedConsent = null;
  try {
    var raw = localStorage.getItem('jv_cc');
    if (raw) {
      storedConsent = JSON.parse(raw);
    }
  } catch (e) {}
  if (
    storedConsent &&
    typeof storedConsent.essential === 'boolean' &&
    typeof storedConsent.analytics === 'boolean' &&
    typeof storedConsent.marketing === 'boolean'
  ) {
    gtag('consent', 'update', {
      analytics_storage: storedConsent.analytics ? 'granted' : 'denied',
      ad_storage: storedConsent.marketing ? 'granted' : 'denied',
      ad_user_data: storedConsent.marketing ? 'granted' : 'denied',
      ad_personalization: storedConsent.marketing ? 'granted' : 'denied'
    });
    return;
  }
  if (bannerRequired) {
    gtag('consent', 'update', denied);
    return;
  }
  gtag('consent', 'update', granted);
})();
`.trim();
}

export function buildGoogleAnalyticsConfigScript(
  measurementId: string
): string {
  if (!isValidGaMeasurementId(measurementId)) {
    throw new Error('Invalid GA measurement ID');
  }

  return `
gtag('js', new Date());
gtag('config', '${measurementId}');
`.trim();
}
