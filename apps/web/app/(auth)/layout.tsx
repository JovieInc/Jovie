import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { publicEnv } from '@/lib/env-public';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const featureFlagsBootstrap = await getFeatureFlagsBootstrap(null);

  return (
    <AuthClientProviders publishableKey={publishableKey}>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <main id='main-content'>{children}</main>
      </FeatureFlagsProvider>
    </AuthClientProviders>
  );
}
