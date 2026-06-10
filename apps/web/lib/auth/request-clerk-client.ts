import { createClerkClient } from '@clerk/backend';
import { clerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { getRequestLocationFromHeaders } from '@/components/providers/clerkAvailability';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

function hostnameFromHeader(value: string | null): string | null {
  const firstHost = value?.split(',')[0]?.trim();
  if (!firstHost) return null;
  return firstHost.split(':')[0]?.toLowerCase() || null;
}

export function getRequestHostname(request: Request): string {
  return (
    hostnameFromHeader(request.headers.get('x-forwarded-host')) ??
    hostnameFromHeader(request.headers.get('host')) ??
    new URL(request.url).hostname.toLowerCase()
  );
}

function createStagingClerkClient(hostname: string): ClerkClient {
  const keys = resolveClerkKeys(hostname);
  if (!keys.secretKey) {
    throw new Error(`Staging Clerk secret unavailable: ${keys.status}`);
  }

  return createClerkClient({
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
  }) as ClerkClient;
}

export async function getRequestClerkClient(
  request: Request
): Promise<ClerkClient> {
  const hostname = getRequestHostname(request);
  if (!isStagingHost(hostname)) {
    return clerkClient();
  }

  return createStagingClerkClient(hostname);
}

/**
 * Resolve a Clerk backend client for server actions/components.
 *
 * Uses the request host to pick the staging Clerk instance when needed.
 * Dashboard auth reconciliation calls resolveUserState() with only a Clerk
 * user id; without host-aware key selection, staging sessions can be looked up
 * against the production Clerk API and email resolution fails.
 */
export async function getServerClerkClient(): Promise<ClerkClient | null> {
  let hostname = '';
  try {
    const hdrs = await headers();
    hostname = getRequestLocationFromHeaders(hdrs)?.hostname ?? '';
  } catch {
    // headers() is unavailable outside a request context (tests, scripts).
  }

  if (!hostname) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return null;
    return createClerkClient({ secretKey }) as ClerkClient;
  }

  if (!isStagingHost(hostname)) {
    return clerkClient();
  }

  const keys = resolveClerkKeys(hostname);
  if (!keys.secretKey) {
    return null;
  }

  return createClerkClient({
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
  }) as ClerkClient;
}
