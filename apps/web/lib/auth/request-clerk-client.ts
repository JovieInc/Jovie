import { createClerkClient } from '@clerk/backend';
import { isStagingHost, resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';

type ClerkClient = ReturnType<typeof createClerkClient>;

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

export async function getRequestClerkClient(
  request: Request
): Promise<ClerkClient> {
  const hostname = getRequestHostname(request);
  const keys = resolveClerkKeys(hostname);
  if (!keys.secretKey) {
    const prefix = isStagingHost(hostname) ? 'Staging Clerk' : 'Clerk';
    throw new Error(`${prefix} secret unavailable: ${keys.status}`);
  }

  // Native exchange and other server routes that bypass Clerk middleware must
  // not depend on clerkClient() from @clerk/nextjs/server.
  return createClerkClient({
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
  });
}
