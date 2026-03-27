import './auth-utilities.css';
import Script from 'next/script';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { shouldBypassClerk } from '@/components/providers/clerkAvailability';
import {
  AuthLayout as AuthShellLayout,
  AuthUnavailableCard,
} from '@/features/auth';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = await resolvePublishableKeyFromHeaders();
  const featureFlagsBootstrap = await getFeatureFlagsBootstrap(null);
  const isClerkUnavailable = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  if (isClerkUnavailable) {
    return (
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        {/* Keep auth routes theme-aware without forcing the marketing homepage to
            download the theme bootstrap on first paint. */}
        <Script src='/theme-init.js' strategy='beforeInteractive' />
        <main id='main-content'>
          <AuthShellLayout
            formTitle='Auth unavailable'
            showFormTitle={false}
            showFooterPrompt={false}
          >
            <AuthUnavailableCard />
          </AuthShellLayout>
        </main>
      </FeatureFlagsProvider>
    );
  }

  return (
    <AuthClientProviders publishableKey={publishableKey}>
      <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
        <Script src='/theme-init.js' strategy='beforeInteractive' />
        <main id='main-content'>{children}</main>
      </FeatureFlagsProvider>
    </AuthClientProviders>
  );
}
