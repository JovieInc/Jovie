import { describe, expect, it } from 'vitest';
import {
  detectMobileWebPlatform,
  isEligibleOpenInAppPath,
  isInAppWebViewUserAgent,
  isOpenInAppDismissed,
  OPEN_IN_APP_DISMISSAL_STORAGE_KEY,
  OPEN_IN_APP_DISMISSAL_TTL_MS,
  persistOpenInAppDismissal,
  resolveOpenInAppEligibility,
  resolveOpenInAppTarget,
} from './open-in-app';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_WKWEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const DESKTOP_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

function fakeStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    map,
  };
}

describe('detectMobileWebPlatform', () => {
  it('detects iOS and Android', () => {
    expect(detectMobileWebPlatform(IPHONE_SAFARI_UA)).toBe('ios');
    expect(detectMobileWebPlatform(ANDROID_CHROME_UA)).toBe('android');
  });

  it('returns null for desktop and empty agents', () => {
    expect(detectMobileWebPlatform(DESKTOP_SAFARI_UA)).toBeNull();
    expect(detectMobileWebPlatform(null)).toBeNull();
  });
});

describe('isInAppWebViewUserAgent', () => {
  it('treats an iOS UA without a Safari token as the native webview', () => {
    expect(isInAppWebViewUserAgent(IPHONE_WKWEBVIEW_UA)).toBe(true);
    expect(isInAppWebViewUserAgent(IPHONE_SAFARI_UA)).toBe(false);
  });

  it('detects Android WebView markers', () => {
    expect(isInAppWebViewUserAgent(ANDROID_WEBVIEW_UA)).toBe(true);
    expect(isInAppWebViewUserAgent(ANDROID_CHROME_UA)).toBe(false);
  });
});

describe('isEligibleOpenInAppPath', () => {
  it('allows the signed-in /app shell', () => {
    expect(isEligibleOpenInAppPath('/app')).toBe(true);
    expect(isEligibleOpenInAppPath('/app/settings')).toBe(true);
    expect(isEligibleOpenInAppPath('/app/chat')).toBe(true);
  });

  it('rejects public profiles, auth transitions, and other routes', () => {
    expect(isEligibleOpenInAppPath('/tim')).toBe(false);
    expect(isEligibleOpenInAppPath('/')).toBe(false);
    expect(isEligibleOpenInAppPath('/auth/native-return')).toBe(false);
    expect(isEligibleOpenInAppPath('/mobile-auth-return')).toBe(false);
    expect(isEligibleOpenInAppPath('/application')).toBe(false);
    expect(isEligibleOpenInAppPath(null)).toBe(false);
  });
});

describe('resolveOpenInAppTarget', () => {
  it('maps /app/settings to the verified settings deep link', () => {
    expect(resolveOpenInAppTarget('/app/settings')).toEqual({
      schemeUrl: 'ie.jov.jovie://settings',
      universalPath: '/app/settings',
    });
    expect(resolveOpenInAppTarget('/app/settings/account')?.schemeUrl).toBe(
      'ie.jov.jovie://settings'
    );
  });

  it('maps other /app routes to the verified chat-home deep link', () => {
    expect(resolveOpenInAppTarget('/app/chat')).toEqual({
      schemeUrl: 'ie.jov.jovie://start',
      universalPath: '/app/start',
    });
    expect(resolveOpenInAppTarget('/app/profile')?.schemeUrl).toBe(
      'ie.jov.jovie://start'
    );
  });

  it('returns null for ineligible routes', () => {
    expect(resolveOpenInAppTarget('/tim')).toBeNull();
  });
});

describe('resolveOpenInAppEligibility', () => {
  it('returns a target for mobile Safari on an /app route', () => {
    const eligibility = resolveOpenInAppEligibility({
      userAgent: IPHONE_SAFARI_UA,
      pathname: '/app/settings',
    });
    expect(eligibility?.platform).toBe('ios');
    expect(eligibility?.target.schemeUrl).toBe('ie.jov.jovie://settings');
  });

  it('never renders inside the native app webview', () => {
    expect(
      resolveOpenInAppEligibility({
        userAgent: IPHONE_WKWEBVIEW_UA,
        pathname: '/app/chat',
      })
    ).toBeNull();
  });

  it('never renders on desktop or in standalone/PWA display', () => {
    expect(
      resolveOpenInAppEligibility({
        userAgent: DESKTOP_SAFARI_UA,
        pathname: '/app/chat',
      })
    ).toBeNull();
    expect(
      resolveOpenInAppEligibility({
        userAgent: IPHONE_SAFARI_UA,
        pathname: '/app/chat',
        isStandaloneDisplay: true,
      })
    ).toBeNull();
  });

  it('never renders on ineligible routes', () => {
    expect(
      resolveOpenInAppEligibility({
        userAgent: IPHONE_SAFARI_UA,
        pathname: '/tim',
      })
    ).toBeNull();
  });
});

describe('dismissal policy', () => {
  it('is not dismissed before any write', () => {
    expect(isOpenInAppDismissed(fakeStorage())).toBe(false);
  });

  it('persists a dismissal inside the TTL window', () => {
    const storage = fakeStorage();
    persistOpenInAppDismissal(storage, 1_000);
    expect(storage.getItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY)).toBe('1000');
    expect(isOpenInAppDismissed(storage, 1_000 + 1)).toBe(true);
    expect(
      isOpenInAppDismissed(storage, 1_000 + OPEN_IN_APP_DISMISSAL_TTL_MS + 1)
    ).toBe(false);
  });

  it('ignores malformed stored values', () => {
    const storage = fakeStorage({
      [OPEN_IN_APP_DISMISSAL_STORAGE_KEY]: 'not-a-number',
    });
    expect(isOpenInAppDismissed(storage)).toBe(false);
  });
});
