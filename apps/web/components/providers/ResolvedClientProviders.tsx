import { headers } from 'next/headers';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { getClientAuthBootstrap } from '@/lib/auth/dev-test-auth.server';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';
import type { ThemeMode } from '@/types';
import {
  getRequestLocationFromHeaders,
  shouldBypassClerk,
} from './clerkAvailability';

interface ResolvedClientProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
  readonly skipCoreProviders?: boolean;
}

export async function ResolvedClientProviders({
  children,
  initialThemeMode,
  skipCoreProviders,
}: ResolvedClientProvidersProps) {
  const [hdrs, publishableKey, authBootstrap] = await Promise.all([
    headers(),
    resolvePublishableKeyFromHeaders(),
    getClientAuthBootstrap(),
  ]);
  const requestLocation = getRequestLocationFromHeaders(hdrs);
  const forceBypassClerk = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK,
    requestLocation
  );

  return (
    <ClientProviders
      authBootstrap={authBootstrap}
      forceBypassClerk={forceBypassClerk}
      initialThemeMode={initialThemeMode}
      publishableKey={publishableKey}
      skipCoreProviders={skipCoreProviders}
    >
      {children}
    </ClientProviders>
  );
}
