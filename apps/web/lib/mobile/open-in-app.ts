/**
 * "Open in Jovie" mobile-web banner contract (JOV-4479).
 *
 * Verified deep-link contract (see apps/ios AppShellIntentNavigation +
 * lib/ios/apple-app-site-association.ts):
 * - Custom scheme `ie.jov.jovie://settings` and `ie.jov.jovie://start` resolve
 *   to Settings and chat home via `MobileSignedInLinkRoute.resolve`.
 * - Universal links `https://jov.ie/app/*` are in the AASA payload and resolve
 *   the same way; when the app is not installed they load the equivalent
 *   signed-in web page, so the fallback stays on the web with no loop.
 *
 * Unknown `ie.jov.jovie://` hosts resolve to nil in the app and are ignored,
 * so an unrecognized target still fails safe.
 */

import { APP_ROUTES } from '@/constants/routes';

/** Custom URL scheme registered by the iOS app (Better Auth trusted scheme). */
export const JOVIE_IOS_APP_SCHEME = 'ie.jov.jovie';

/** localStorage key holding the dismissal timestamp (ms since epoch). */
export const OPEN_IN_APP_DISMISSAL_STORAGE_KEY =
  'jovie.open-in-app.dismissedAt';

/** Short-lived dismissal policy: re-offer after 7 days. */
export const OPEN_IN_APP_DISMISSAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long to wait for the app to take focus before concluding the deep
 * link failed and staying on the web page.
 */
export const OPEN_IN_APP_TIMEOUT_MS = 1600;

const APP_SHELL_PREFIX = APP_ROUTES.DASHBOARD;
const SETTINGS_PREFIX = APP_ROUTES.SETTINGS;

export type MobileWebPlatform = 'ios' | 'android';

export interface OpenInAppTarget {
  /**
   * `ie.jov.jovie://` custom-scheme URL. Fired first because Safari will not
   * follow a universal link that points at the domain the user is already on.
   */
  readonly schemeUrl: string;
  /**
   * Same-origin `/app/*` path that is both the universal link and the safe
   * web fallback — it renders the equivalent web surface when the app is
   * not installed.
   */
  readonly universalPath: string;
}

export interface OpenInAppEligibilityInput {
  readonly userAgent: string | null | undefined;
  readonly pathname: string | null | undefined;
  /** True when running as an installed PWA / home-screen app. */
  readonly isStandaloneDisplay?: boolean;
}

export interface OpenInAppEligibility {
  readonly platform: MobileWebPlatform;
  readonly target: OpenInAppTarget;
}

/**
 * Detects an embedded WKWebView / Android WebView user agent. The native
 * app's in-app browser must never see this banner.
 *
 * - iOS WKWebView UAs end with `Mobile/15E148` and carry no `Safari/` token.
 * - Android WebView UAs carry `; wv)` (or ` wv;`) in the platform section.
 */
export function isInAppWebViewUserAgent(
  userAgent: string | null | undefined
): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  const isIos = ua.includes('iphone') || ua.includes('ipad');
  if (isIos) return !ua.includes('safari/');
  if (ua.includes('android')) return /;\s*wv\)|\bwv;/.test(ua);
  return false;
}

/** Detects a mobile-web browser platform from a user agent string. */
export function detectMobileWebPlatform(
  userAgent: string | null | undefined
): MobileWebPlatform | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('android')) return 'android';
  return null;
}

/**
 * Approved mobile-web surfaces: the signed-in `/app/*` shell only. Auth
 * transitions (`/auth/*`, `/mobile-auth-return`), marketing pages, and
 * public profiles are never eligible — the app has no verified profile
 * deep-link route, so a banner there could only strand the visitor.
 */
export function isEligibleOpenInAppPath(
  pathname: string | null | undefined
): boolean {
  if (!pathname) return false;
  return (
    pathname === APP_SHELL_PREFIX || pathname.startsWith(`${APP_SHELL_PREFIX}/`)
  );
}

/**
 * Maps an eligible `/app/*` pathname to the verified deep-link target.
 * `/app/settings*` keeps its section; everything else lands on chat home
 * (`/app/start`), the app's default signed-in route.
 */
export function resolveOpenInAppTarget(
  pathname: string | null | undefined
): OpenInAppTarget | null {
  if (!isEligibleOpenInAppPath(pathname)) return null;

  const normalized = (pathname ?? '').toLowerCase();
  const section =
    normalized === SETTINGS_PREFIX ||
    normalized.startsWith(`${SETTINGS_PREFIX}/`)
      ? 'settings'
      : 'start';

  return {
    schemeUrl: `${JOVIE_IOS_APP_SCHEME}://${section}`,
    universalPath: `${APP_SHELL_PREFIX}/${section}`,
  };
}

/**
 * Full eligibility check for the banner. Returns null when the banner must
 * not render: desktop UA, native in-app webview, installed PWA, or an
 * unapproved route.
 */
export function resolveOpenInAppEligibility(
  input: OpenInAppEligibilityInput
): OpenInAppEligibility | null {
  const platform = detectMobileWebPlatform(input.userAgent);
  if (!platform) return null;
  if (isInAppWebViewUserAgent(input.userAgent)) return null;
  if (input.isStandaloneDisplay) return null;

  const target = resolveOpenInAppTarget(input.pathname);
  if (!target) return null;

  return { platform, target };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True when a stored dismissal is still inside its TTL window. */
export function isOpenInAppDismissed(
  storage: Pick<StorageLike, 'getItem'>,
  now: number = Date.now()
): boolean {
  const raw = storage.getItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < OPEN_IN_APP_DISMISSAL_TTL_MS;
}

/** Persists a dismissal timestamp; storage failures are non-fatal. */
export function persistOpenInAppDismissal(
  storage: StorageLike,
  now: number = Date.now()
): void {
  try {
    storage.setItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY, String(now));
  } catch {
    // Private-mode / quota failures only mean the banner may reappear.
  }
}
