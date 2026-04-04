import './auth-utilities.css';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { shouldBypassClerk } from '@/components/providers/clerkAvailability';
import {
  AuthLayout as AuthShellLayout,
  AuthUnavailableCard,
} from '@/features/auth';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = await resolvePublishableKeyFromHeaders();
  const isClerkUnavailable = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  if (isClerkUnavailable) {
    return (
      <FeatureFlagsProvider>
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
      <FeatureFlagsProvider>
        <main id='main-content'>{children}</main>
      </FeatureFlagsProvider>
    </AuthClientProviders>
  );
}
