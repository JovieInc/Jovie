import { ClientProviders } from '@/components/providers/ClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { publicEnv } from '@/lib/env-public';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';

export const dynamic = 'force-dynamic';

export default async function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const authResult = await resolveUserState();
  const featureFlagsBootstrap = await getFeatureFlagsBootstrap(
    authResult.clerkUserId ?? null
  );

  return (
    <ClientProviders publishableKey={publishableKey} skipCoreProviders>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        {children}
      </FeatureFlagsProvider>
    </ClientProviders>
  );
}
