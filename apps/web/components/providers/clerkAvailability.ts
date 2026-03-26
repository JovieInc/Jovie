import { publicEnv } from '@/lib/env-public';

const VALID_CLERK_PUBLISHABLE_KEY_PREFIXES = ['pk_live_', 'pk_test_'] as const;
type ClerkProxyLocation = Pick<Location, 'hostname' | 'protocol'>;

export function isMockPublishableKey(publishableKey: string): boolean {
  const normalizedKey = publishableKey.trim().toLowerCase();

  return !VALID_CLERK_PUBLISHABLE_KEY_PREFIXES.some(prefix =>
    normalizedKey.startsWith(prefix)
  );
}

export function shouldBypassClerk(
  publishableKey: string | undefined,
  clerkMockFlag: string | undefined
): boolean {
  const normalizedKey = publishableKey?.trim();
  return (
    !normalizedKey ||
    clerkMockFlag === '1' ||
    isMockPublishableKey(normalizedKey)
  );
}

function shouldDisableProxyForLocation(
  location: ClerkProxyLocation | undefined
): boolean {
  if (!location) return false;

  const isLocalHost =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  return isLocalHost && location.protocol !== 'https:';
}

export function getClerkProxyUrl(
  location?: ClerkProxyLocation
): string | undefined {
  // Disable proxy for screenshot pipeline — Clerk JS loads from its own CDN
  // instead of proxying through localhost (which requires HTTPS and doesn't
  // work in headless Playwright browsers against dev servers).
  if (publicEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1') return undefined;
  if (shouldDisableProxyForLocation(location)) return undefined;
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
