import type { Metadata } from 'next';
import '../../../styles/system-b-app.css';
import { ResolvedClientProviders } from '@/components/providers/ResolvedClientProviders';
import { getRequestSession } from '@/lib/auth/request-session';
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
  //
  // Forced signed-out defaults mean exactly that: no live session. A real
  // cookie-backed session (bypass or sign-in) must keep the live provider —
  // forcing signed-out client auth while the server session is real splits
  // the OnboardingSessionBoundary's restore identity (snapshot identityId vs
  // client 'anonymous' -> invalid-restore) and wedges the nightly auth.setup
  // (JOV-7653). The read is catch-guarded so DB-less visual capture, where
  // the session lookup cannot resolve, still gets its forced defaults.
  //
  // Only a non-secure smoke/E2E host can force signed-out defaults, so the
  // session is read only there. Production and preview never ask for it here.
  const mayForceSignedOutDefaults =
    !isSecureEnv() &&
    env.E2E_TEST_MODE !== '1' &&
    (env.PUBLIC_NOAUTH_SMOKE === '1' ||
      process.env.NEXT_PUBLIC_E2E_MODE === '1');
  const [hasLiveSession, initialFlags] = await Promise.all([
    mayForceSignedOutDefaults
      ? getRequestSession('cookie')
          .then(session => Boolean(session?.user?.id))
          .catch(() => false)
      : false,
    getAppFlagsSnapshot({
      flagNames: resolveStartRouteFlagNames(),
    }),
  ]);
  const forceSignedOutDefaults = mayForceSignedOutDefaults && !hasLiveSession;

  return (
    <ResolvedClientProviders
      forceSignedOutDefaults={forceSignedOutDefaults}
      skipCoreProviders
    >
      <AppFlagProvider initialFlags={initialFlags}>{children}</AppFlagProvider>
    </ResolvedClientProviders>
  );
}
