import type { Metadata } from 'next';
import '../../../styles/system-b-app.css';
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
  // Anonymous onboarding never needs a live session subscribe on loopback
  // E2E/dev hosts. The Golden Path uses a real Better Auth signup, so
  // E2E_TEST_MODE must keep the live cookie-backed provider.
  const forceSignedOutDefaults =
    !isSecureEnv() &&
    env.E2E_TEST_MODE !== '1' &&
    (env.PUBLIC_NOAUTH_SMOKE === '1' ||
      process.env.NEXT_PUBLIC_E2E_MODE === '1');
  const initialFlags = await getAppFlagsSnapshot({
    flagNames: resolveStartRouteFlagNames(),
  });

  return (
    <ResolvedClientProviders
      forceSignedOutDefaults={forceSignedOutDefaults}
      skipCoreProviders
    >
      <AppFlagProvider initialFlags={initialFlags}>{children}</AppFlagProvider>
    </ResolvedClientProviders>
  );
}
