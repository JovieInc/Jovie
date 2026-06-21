import type { Metadata } from 'next';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { env, isSecureEnv } from '@/lib/env-server';
import { AppFlagProvider } from '@/lib/flags/client';
import { resolveStartRouteFlagNames } from '@/lib/flags/route-snapshots';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function StartLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const forceBypassClerk = env.PUBLIC_NOAUTH_SMOKE === '1' && !isSecureEnv();
  const initialFlags = await getAppFlagsSnapshot({
    flagNames: resolveStartRouteFlagNames(),
  });

  return (
    <ResolvedClientProviders
      forceBypassClerk={forceBypassClerk}
      skipCoreProviders
    >
      <AppFlagProvider initialFlags={initialFlags}>{children}</AppFlagProvider>
    </ResolvedClientProviders>
  );
}
