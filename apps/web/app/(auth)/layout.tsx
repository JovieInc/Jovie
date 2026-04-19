import './auth-utilities.css';
import { headers } from 'next/headers';
import { AuthClientProviders } from '@/components/providers/AuthClientProviders';
import { isMockPublishableKey } from '@/components/providers/clerkAvailability';
import {
  AuthLayout as AuthShellLayout,
  AuthUnavailableCard,
} from '@/features/auth';
import { resolvePublishableKeyFromHeaders } from '@/lib/auth/staging-clerk-keys';
import { publicEnv } from '@/lib/env-public';
import { AppFlagProvider } from '@/lib/flags/client';
import { getAppFlagsSnapshot } from '@/lib/flags/server';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialFlags = await getAppFlagsSnapshot();
  const publishableKey = await resolvePublishableKeyFromHeaders();
  await headers();
  const isClerkUnavailable =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (isClerkUnavailable) {
    return (
      <AppFlagProvider initialFlags={initialFlags}>
        <main id='main-content'>
          <AuthShellLayout
            formTitle='Auth unavailable'
            showFormTitle={false}
            showFooterPrompt={false}
          >
            <AuthUnavailableCard />
          </AuthShellLayout>
        </main>
      </AppFlagProvider>
    );
  }

  return (
    <AuthClientProviders forceEnableClerk publishableKey={publishableKey}>
      <AppFlagProvider initialFlags={initialFlags}>
        <main id='main-content'>{children}</main>
      </AppFlagProvider>
    </AuthClientProviders>
  );
}
