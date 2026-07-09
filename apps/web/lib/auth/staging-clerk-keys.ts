import 'server-only';

import { headers } from 'next/headers';
import { HOSTNAME, STAGING_HOSTNAMES } from '@/constants/domains';
import type { ClerkKeyStatus } from '@/lib/auth/clerk-key-status';

interface ClerkKeys {
  publishableKey: string | undefined;
  secretKey: string | undefined;
  status: ClerkKeyStatus;
}

export function isStagingHost(hostname: string): boolean {
  return STAGING_HOSTNAMES.has(hostname);
}

export function resolveClerkKeys(_hostname: string): ClerkKeys {
  return {
    publishableKey: undefined,
    secretKey: undefined,
    status: 'no_publishable_key',
  };
}

export async function resolvePublishableKeyFromHeaders(): Promise<undefined> {
  await headers();
  return undefined;
}

export { CLERK_KEY_STATUS_HEADER } from '@/lib/auth/clerk-key-status';
export { HOSTNAME };
