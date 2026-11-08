import { APP_ROUTES } from '@/constants/routes';

/**
 * Desktop marketing guard: the Mac app is a product surface, so people inside
 * it never land on marketing pages (homepage, pricing, blog, product pages).
 *
 * Edge-safe and dependency-free so `proxy.ts` and client code share one list.
 * `desktop-marketing-guard.test.ts` keeps this list in step with the
 * `app/(marketing)` route group, so a new marketing page is guarded by default.
 */

/** Electron windows append this product token to their user agent. */
const DESKTOP_SHELL_USER_AGENT_PATTERN = /\bJovieDesktop\//;

/** Where a desktop visitor goes instead of a marketing page. */
export const DESKTOP_APP_HOME_PATH = APP_ROUTES.CHAT;

/**
 * First path segments of marketing pages. Every `app/(marketing)` route,
 * plus the marketing pages that live outside the group. `/` is matched
 * separately because it is the homepage, not a prefix.
 */
export const DESKTOP_MARKETING_ROUTE_SEGMENTS = [
  'about',
  'ai',
  'alternatives',
  'api-versioning',
  'artist-notifications',
  'artist-profile',
  'artist-profiles',
  'artists',
  'blog',
  'brand',
  'card',
  'changelog',
  'cli',
  'compare',
  'demo',
  'demovideo',
  'developers',
  'download',
  'engineering',
  'instant-merch',
  'integrations',
  'launch',
  'new',
  'pay',
  'pricing',
  'product',
  'proof',
  'renders',
  'smart-links',
  'solutions',
  'voice',
  'youtube-thumbnails',
] as const;

/**
 * `app/(marketing)` routes that stay reachable inside the Mac app, with why.
 * The test fails if a route group entry is neither guarded nor listed here.
 */
export const DESKTOP_MARKETING_GUARD_EXEMPT_SEGMENTS = {
  support: 'Help and contact; people in the app still need a way to get help.',
} as const satisfies Record<string, string>;

const MARKETING_SEGMENT_SET = new Set<string>(DESKTOP_MARKETING_ROUTE_SEGMENTS);

export function isDesktopShellUserAgent(
  userAgent: string | null | undefined
): boolean {
  return (
    typeof userAgent === 'string' &&
    DESKTOP_SHELL_USER_AGENT_PATTERN.test(userAgent)
  );
}

/** True for the homepage and every path under a guarded marketing segment. */
export function isDesktopMarketingPath(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const trimmed = decoded.replace(/\/+$/, '');
  if (trimmed === '') return true;

  const [firstSegment] = trimmed.split('/').filter(Boolean);
  return (
    firstSegment !== undefined &&
    MARKETING_SEGMENT_SET.has(firstSegment.toLowerCase())
  );
}

/**
 * The in-app destination for a desktop request to a marketing page, or
 * `null` when the request is not a desktop marketing navigation. Signed-out
 * visitors are sent on to sign-in by the app home's own auth gate.
 */
export function resolveDesktopMarketingRedirect(input: {
  readonly method: string;
  readonly pathname: string;
  readonly userAgent: string | null | undefined;
}): string | null {
  if (input.method !== 'GET' && input.method !== 'HEAD') return null;
  if (!isDesktopShellUserAgent(input.userAgent)) return null;
  if (!isDesktopMarketingPath(input.pathname)) return null;
  return `${DESKTOP_APP_HOME_PATH}?runtime=electron`;
}
