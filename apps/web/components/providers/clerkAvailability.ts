import { publicEnv } from '@/lib/env-public';

const VALID_CLERK_PUBLISHABLE_KEY_PREFIXES = ['pk_live_', 'pk_test_'] as const;
const PRIVATE_IPV4_BLOCKS = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
] as const;

export function isMockPublishableKey(publishableKey: string): boolean {
  const normalizedKey = publishableKey.trim().toLowerCase();

  return !VALID_CLERK_PUBLISHABLE_KEY_PREFIXES.some(prefix =>
    normalizedKey.startsWith(prefix)
  );
}

export function shouldBypassClerk(
  publishableKey: string | undefined,
  clerkMockFlag: string | undefined,
  locationLike:
    | Pick<Location, 'hostname' | 'protocol'>
    | Pick<URL, 'hostname' | 'protocol'>
    | undefined = globalThis.window === undefined
    ? undefined
    : globalThis.location
): boolean {
  const normalizedKey = publishableKey?.trim();
  return (
    !normalizedKey ||
    clerkMockFlag === '1' ||
    isMockPublishableKey(normalizedKey)
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname.endsWith('.local')
  ) {
    return true;
  }

  return PRIVATE_IPV4_BLOCKS.some(pattern => pattern.test(normalizedHostname));
}

export function shouldDisableClerkProxyForLocation(
  locationLike:
    | Pick<Location, 'hostname' | 'protocol'>
    | Pick<URL, 'hostname' | 'protocol'>
    | undefined
): boolean {
  if (!locationLike) return false;

  return (
    locationLike.protocol === 'http:' &&
    isPrivateHostname(locationLike.hostname)
  );
}

export function getClerkProxyUrl(
  locationLike:
    | Pick<Location, 'hostname' | 'protocol'>
    | Pick<URL, 'hostname' | 'protocol'>
    | undefined = globalThis.window === undefined
    ? undefined
    : globalThis.location
): string | undefined {
  // Disable proxy for screenshot pipeline — Clerk JS loads from its own CDN
  // instead of proxying through localhost (which requires HTTPS and doesn't
  // work in headless Playwright browsers against dev servers).
  if (publicEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1') return undefined;
  // During SSR, window is unavailable — return undefined so Clerk doesn't
  // attempt new URL(proxyUrl, window.location.origin) server-side.
  if (globalThis.window === undefined) return undefined;
  if (shouldDisableClerkProxyForLocation(locationLike)) return undefined;
  return publicEnv.NEXT_PUBLIC_CLERK_PROXY_URL || '/__clerk';
}

/**
 * Decode the FAPI host from the publishable key and return the Clerk JS
 * bundle URL. Clerk JS + chunks must load from the FAPI domain directly
 * (via CNAME) because the /__clerk middleware proxy can't serve webpack
 * chunks — only the Clerk CDN infrastructure behind the CNAME can.
 *
 * Returns undefined in dev (pk_test_) so Clerk loads JS from its default CDN.
 */
export function getClerkJSUrl(): string | undefined {
  if (publicEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1') return undefined;

  const pk = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  if (!pk.startsWith('pk_live_')) return undefined;

  try {
    const b64 = pk.replace(/^pk_live_/, '');
    const fapiHost = atob(b64).replace(/\$$/, '');
    if (!fapiHost) return undefined;
    return `https://${fapiHost}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
  } catch {
    return undefined;
  }
}
