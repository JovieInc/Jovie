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
  // Anonymous onboarding never needs a live Clerk bootstrap on loopback E2E/dev
  // hosts — loading FAPI JS from localhost causes CORS console errors and jank.
  // The Golden Path uses the same loopback Turnstile bypass with a real Better
  // Auth signup, so E2E_TEST_MODE must keep the live cookie-backed provider.
  const forceBypassClerk =
    !isSecureEnv() &&
    env.E2E_TEST_MODE !== '1' &&
    (env.PUBLIC_NOAUTH_SMOKE === '1' ||
      process.env.NEXT_PUBLIC_E2E_MODE === '1');
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
