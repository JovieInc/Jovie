import { createClerkClient } from '@clerk/backend';
import { clerkClient } from '@clerk/nextjs/server';
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

export async function getRequestClerkClient(
  request: Request
): Promise<ClerkClient> {
  const hostname = getRequestHostname(request);
  if (!isStagingHost(hostname)) {
    return clerkClient();
  }

  const keys = resolveClerkKeys(hostname);
  if (!keys.secretKey) {
    throw new Error(`Staging Clerk secret unavailable: ${keys.status}`);
  }

  return createClerkClient({
    publishableKey: keys.publishableKey,
    secretKey: keys.secretKey,
  }) as ClerkClient;
}
