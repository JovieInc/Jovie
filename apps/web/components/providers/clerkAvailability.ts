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
