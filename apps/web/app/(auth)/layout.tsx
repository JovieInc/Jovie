import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { shouldBypassClerk } from '@/components/providers/clerkAvailability';
import {
  AuthLayout as AuthShellLayout,
  AuthUnavailableCard,
} from '@/features/auth';
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
  const isClerkUnavailable = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  if (isClerkUnavailable) {
    return (
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <AuthShellLayout
          formTitle='Auth unavailable'
          showFormTitle={false}
          showFooterPrompt={false}
        >
          <main id='main-content'>
            <AuthUnavailableCard />
          </main>
        </AuthShellLayout>
      </FeatureFlagsProvider>
    );
  }

  return (
    <AuthClientProviders publishableKey={publishableKey}>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <main id='main-content'>{children}</main>
      </FeatureFlagsProvider>
    </AuthClientProviders>
  );
}
